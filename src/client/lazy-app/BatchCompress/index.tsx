import { h, Component } from 'preact';

import * as style from './style.css';
import 'add-css:./style.css';

import {
  builtinDecode,
  sniffMimeType,
  canDecodeImageType,
  abortable,
  assertSignal,
  ImageMimeTypes,
} from '../util';
import {
  PreprocessorState,
  ProcessorState,
  EncoderState,
  encoderMap,
  defaultPreprocessorState,
  defaultProcessorState,
} from '../feature-meta';

import WorkerBridge from '../worker-bridge';
import { resize } from 'features/processors/resize/client';
import type SnackBarElement from 'shared/custom-els/snack-bar';

import BatchOptions from './BatchOptions';
import BatchItem from './BatchItem';
import type { OutputType, SourceImage } from '../Compress';

// Reuse decoding logic
async function decodeImage(
  signal: AbortSignal,
  blob: Blob,
  workerBridge: WorkerBridge,
): Promise<ImageData> {
  assertSignal(signal);
  const mimeType = await abortable(signal, sniffMimeType(blob));
  const canDecode = await abortable(signal, canDecodeImageType(mimeType));

  try {
    if (!canDecode) {
      if (mimeType === 'image/avif') {
        return await workerBridge.avifDecode(signal, blob);
      }
      if (mimeType === 'image/webp') {
        return await workerBridge.webpDecode(signal, blob);
      }
      if (mimeType === 'image/jxl') {
        return await workerBridge.jxlDecode(signal, blob);
      }
      if (mimeType === 'image/webp2') {
        return await workerBridge.wp2Decode(signal, blob);
      }
      if (mimeType === 'image/qoi') {
        return await workerBridge.qoiDecode(signal, blob);
      }
    }
    return await builtinDecode(signal, blob);
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') throw err;
    throw Error("Couldn't decode image");
  }
}

async function processImage(
  signal: AbortSignal,
  preprocessed: ImageData,
  processorState: ProcessorState,
  workerBridge: WorkerBridge,
): Promise<ImageData> {
  assertSignal(signal);
  let result = preprocessed;

  if (processorState.resize.enabled) {
    // Mock SourceImage for resize
    const mockSource: any = { preprocessed };
    result = await resize(signal, mockSource, processorState.resize, workerBridge);
  }
  if (processorState.quantize.enabled) {
    result = await workerBridge.quantize(signal, result, processorState.quantize);
  }
  return result;
}

async function compressImage(
  signal: AbortSignal,
  image: ImageData,
  encodeData: EncoderState,
  sourceFilename: string,
  workerBridge: WorkerBridge,
): Promise<File> {
  assertSignal(signal);
  const encoder = encoderMap[encodeData.type];
  const compressedData = await encoder.encode(
    signal,
    workerBridge,
    image,
    encodeData.options as any,
  );
  const type: ImageMimeTypes = encoder.meta.mimeType;
  return new File(
    [compressedData],
    sourceFilename.replace(/\.[^.]+$/, `.${encoder.meta.extension}`),
    { type },
  );
}

interface Props {
  files: File[];
  showSnack: SnackBarElement['showSnackbar'];
  onBack: () => void;
}

interface FileJob {
  file: File;
  loading: boolean;
  compressedFile?: File;
  error?: string;
  decodedData?: ImageData;
}

interface State {
  jobs: FileJob[];
  processorState: ProcessorState;
  encoderState?: EncoderState;
  processing: boolean;
}

export default class BatchCompress extends Component<Props, State> {
  private workerBridges = [new WorkerBridge(), new WorkerBridge(), new WorkerBridge()];
  private abortController = new AbortController();

  state: State = {
    jobs: this.props.files.map(file => ({ file, loading: false })),
    processorState: defaultProcessorState,
    encoderState: {
      type: 'mozJPEG',
      options: encoderMap.mozJPEG.meta.defaultOptions,
    },
    processing: false,
  };

  componentWillUnmount() {
    this.abortController.abort();
  }

  private onEncoderTypeChange = (newType: OutputType): void => {
    this.setState({
      encoderState: newType === 'identity' ? undefined : ({
        type: newType,
        options: encoderMap[newType].meta.defaultOptions,
      } as any),
    }, this.startBatchProcessing);
  };

  private onProcessorOptionsChange = (options: ProcessorState): void => {
    this.setState({ processorState: options }, this.startBatchProcessing);
  };

  private onEncoderOptionsChange = (options: any): void => {
    this.setState({
      encoderState: {
        ...this.state.encoderState!,
        options,
      },
    }, this.startBatchProcessing);
  };

  private startBatchProcessing = () => {
    if (!this.state.encoderState) return;

    this.abortController.abort();
    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    // Reset status
    const jobs = this.state.jobs.map(job => ({ ...job, loading: true, error: undefined, compressedFile: undefined }));
    this.setState({ jobs, processing: true });

    this.processQueue(jobs, signal);
  };

  private processQueue = async (initialJobs: FileJob[], signal: AbortSignal) => {
    const queue = initialJobs.map((_, i) => i);
    
    const workerPromises = this.workerBridges.map(async (workerBridge) => {
      while (queue.length > 0) {
        if (signal.aborted) return;
        const index = queue.shift()!;
        
        try {
          const job = this.state.jobs[index];
          let decodedData = job.decodedData;
          
          if (!decodedData) {
            decodedData = await decodeImage(signal, job.file, workerBridge);
            // Cache decoded data to save time on setting changes
            this.setState(s => {
              const newJobs = [...s.jobs];
              newJobs[index] = { ...newJobs[index], decodedData };
              return { jobs: newJobs };
            });
          }

          if (signal.aborted) return;

          const processed = await processImage(signal, decodedData, this.state.processorState, workerBridge);
          
          if (signal.aborted) return;

          const compressedFile = await compressImage(
            signal,
            processed,
            this.state.encoderState!,
            job.file.name,
            workerBridge,
          );

          if (signal.aborted) return;

          this.setState(s => {
            const newJobs = [...s.jobs];
            newJobs[index] = { ...newJobs[index], loading: false, compressedFile };
            return { jobs: newJobs };
          });
        } catch (err: any) {
          if (signal.aborted) return;
          this.setState(s => {
            const newJobs = [...s.jobs];
            newJobs[index] = { ...newJobs[index], loading: false, error: err.message || 'Error' };
            return { jobs: newJobs };
          });
        }
      }
    });

    await Promise.all(workerPromises);
    if (!signal.aborted) {
      this.setState({ processing: false });
    }
  };

  private downloadZip = async () => {
    try {
      const { zipSync } = await import('fflate');
      const files: Record<string, Uint8Array> = {};
      
      for (const job of this.state.jobs) {
        if (job.compressedFile) {
          const buffer = await job.compressedFile.arrayBuffer();
          // Ensure unique filenames
          let name = job.compressedFile.name;
          let counter = 1;
          while (files[name]) {
            const parts = job.compressedFile.name.split('.');
            const ext = parts.pop();
            name = `${parts.join('.')}_${counter++}.${ext}`;
          }
          files[name] = new Uint8Array(buffer);
        }
      }

      const zipped = zipSync(files);
      const blob = new Blob([zipped], { type: 'application/zip' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = 'squoosh-batch.zip';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      this.props.showSnack('打包 ZIP 失败');
    }
  };

  private downloadAllFiles = async () => {
    import('client/utils/analytics').then(({ trackEvent }) => trackEvent('batch-downloaded', { count: this.state.jobs.length }));
    if ('showDirectoryPicker' in window) {
      try {
        const dirHandle = await (window as any).showDirectoryPicker();
        for (const job of this.state.jobs) {
          if (job.compressedFile) {
            let name = job.compressedFile.name;
            let fileHandle;
            try {
              fileHandle = await dirHandle.getFileHandle(name, { create: true });
            } catch (e) {
              const parts = name.split('.');
              const ext = parts.pop();
              name = `${parts.join('.')}_squoosh.${ext}`;
              fileHandle = await dirHandle.getFileHandle(name, { create: true });
            }
            const writable = await fileHandle.createWritable();
            await writable.write(job.compressedFile);
            await writable.close();
          }
        }
        this.props.showSnack('全部图片已保存到选定文件夹');
        return;
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          this.props.showSnack('保存失败，可能未授予文件夹权限');
        }
        return;
      }
    }

    this.props.showSnack('浏览器不支持直接保存文件夹，正在逐个下载...');
    for (const job of this.state.jobs) {
      if (job.compressedFile) {
        const url = URL.createObjectURL(job.compressedFile);
        const a = document.createElement('a');
        a.href = url;
        a.download = job.compressedFile.name;
        a.click();
        URL.revokeObjectURL(url);
      }
    }
  };

  componentDidMount() {
    this.startBatchProcessing();
    import('client/utils/analytics').then(({ refreshAds }) => refreshAds());
  }

  render({ onBack }: Props, { jobs, processorState, encoderState, processing }: State) {
    const allDone = !processing && jobs.some(j => j.compressedFile);
    
    return (
      <div class={style.batchCompress}>
        <div class={style.header}>
          <button class={style.backButton} onClick={onBack}>&larr; 返回</button>
          <div class={style.title}>批量压缩 ({jobs.length} 张图片)</div>
          <div class={style.actions}>
            <button class={style.actionButton} onClick={this.downloadAllFiles} disabled={!allDone}>批量下载图片</button>
            <button class={style.actionButton} onClick={this.downloadZip} disabled={!allDone}>打包成 ZIP 下载</button>
          </div>
        </div>
        <div class={style.content}>
          <div class={style.sidebar}>
            <BatchOptions
              processorState={processorState}
              encoderState={encoderState}
              onEncoderTypeChange={this.onEncoderTypeChange}
              onProcessorOptionsChange={this.onProcessorOptionsChange}
              onEncoderOptionsChange={this.onEncoderOptionsChange}
            />
            {/* AdSense Placeholder */}
            <div style={{ marginTop: '20px', textAlign: 'center', minHeight: '250px' }}>
              <ins class="adsbygoogle"
                   style={{ display: 'block' }}
                   data-ad-client="ca-pub-XXXXXXXXXXXXXXXX"
                   data-ad-slot="XXXXXXXXXX"
                   data-ad-format="auto"
                   data-full-width-responsive="true"></ins>
            </div>
          </div>
          <div class={style.list}>
            {jobs.map(job => (
              <BatchItem {...job} />
            ))}
          </div>
        </div>
      </div>
    );
  }
}
