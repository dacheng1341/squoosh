import type { FileDropEvent } from 'file-drop-element';
import type SnackBarElement from 'shared/custom-els/snack-bar';
import type { SnackOptions } from 'shared/custom-els/snack-bar';

import { h, Component } from 'preact';

import { linkRef } from 'shared/prerendered-app/util';
import * as style from './style.css';
import 'add-css:./style.css';
import 'file-drop-element';
import 'shared/custom-els/snack-bar';
import Intro from 'shared/prerendered-app/Intro';
import 'shared/custom-els/loading-spinner';

const ROUTE_EDITOR = '/editor';

const compressPromise = import('client/lazy-app/Compress');
const batchCompressPromise = import('client/lazy-app/BatchCompress');
const swBridgePromise = import('client/lazy-app/sw-bridge');

function back() {
  window.history.back();
}

interface Props {}

interface State {
  awaitingShareTarget: boolean;
  file?: File;
  files?: File[];
  isEditorOpen: Boolean;
  isBatchEditorOpen: Boolean;
  Compress?: typeof import('client/lazy-app/Compress').default;
  BatchCompress?: typeof import('client/lazy-app/BatchCompress').default;
}

export default class App extends Component<Props, State> {
  state: State = {
    awaitingShareTarget: new URL(location.href).searchParams.has(
      'share-target',
    ),
    isEditorOpen: false,
    isBatchEditorOpen: false,
    file: undefined,
    files: undefined,
    Compress: undefined,
    BatchCompress: undefined,
  };

  snackbar?: SnackBarElement;

  constructor() {
    super();

    compressPromise
      .then((module) => {
        this.setState({ Compress: module.default });
      })
      .catch(() => {
        this.showSnack('Failed to load app');
      });

    batchCompressPromise
      .then((module) => {
        this.setState({ BatchCompress: module.default });
      })
      .catch((e) => {
        console.error(e);
      });

    swBridgePromise.then(async ({ offliner, getSharedImage }) => {
      offliner(this.showSnack);
      if (!this.state.awaitingShareTarget) return;
      const file = await getSharedImage();
      // Remove the ?share-target from the URL
      history.replaceState('', '', '/');
      this.openEditor();
      this.setState({ file, awaitingShareTarget: false });
    });

    // Since iOS 10, Apple tries to prevent disabling pinch-zoom. This is great in theory, but
    // really breaks things on Squoosh, as you can easily end up zooming the UI when you mean to
    // zoom the image. Once you've done this, it's really difficult to undo. Anyway, this seems to
    // prevent it.
    document.body.addEventListener('gesturestart', (event: any) => {
      event.preventDefault();
    });

    window.addEventListener('popstate', this.onPopState);
  }

  private processFiles = async (files: File[]) => {
    if (files.length === 1 && files[0].name.toLowerCase().endsWith('.zip')) {
      try {
        const { unzipSync } = await import('fflate');
        const buffer = await files[0].arrayBuffer();
        const unzipped = unzipSync(new Uint8Array(buffer));
        const extractedFiles: File[] = [];
        
        for (const [filename, data] of Object.entries(unzipped)) {
          if (data.length === 0 || filename.endsWith('/')) continue; // skip directories
          const lowerName = filename.toLowerCase();
          if (lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg') || 
              lowerName.endsWith('.png') || lowerName.endsWith('.webp') || 
              lowerName.endsWith('.avif') || lowerName.endsWith('.svg') || 
              lowerName.endsWith('.gif')) {
            // infer mime type roughly
            let type = 'image/jpeg';
            if (lowerName.endsWith('.png')) type = 'image/png';
            if (lowerName.endsWith('.webp')) type = 'image/webp';
            if (lowerName.endsWith('.avif')) type = 'image/avif';
            if (lowerName.endsWith('.svg')) type = 'image/svg+xml';
            if (lowerName.endsWith('.gif')) type = 'image/gif';
            extractedFiles.push(new File([data], filename, { type }));
          }
        }
        if (extractedFiles.length > 0) {
          this.openBatchEditor();
          this.setState({ files: extractedFiles });
        } else {
          this.showSnack('ZIP 包中未找到支持的图片');
        }
      } catch (err) {
        this.showSnack('解析 ZIP 文件失败');
        console.error(err);
      }
      return;
    }

    if (files.length > 1) {
      this.openBatchEditor();
      this.setState({ files });
    } else {
      this.openEditor();
      this.setState({ file: files[0] });
    }
  };

  private onFileDrop = ({ files }: FileDropEvent) => {
    if (!files || files.length === 0) return;
    this.processFiles(Array.from(files));
  };

  private onIntroPickFile = (file: File) => {
    this.processFiles([file]);
  };

  private onIntroPickFiles = (files: File[]) => {
    this.processFiles(files);
  };

  private showSnack = (
    message: string,
    options: SnackOptions = {},
  ): Promise<string> => {
    if (!this.snackbar) throw Error('Snackbar missing');
    return this.snackbar.showSnackbar(message, options);
  };

  private onPopState = () => {
    this.setState({ 
      isEditorOpen: location.pathname === ROUTE_EDITOR,
      isBatchEditorOpen: location.pathname === '/batch-editor'
    });
  };

  private openEditor = () => {
    if (this.state.isEditorOpen) return;
    const editorURL = new URL(location.href);
    editorURL.pathname = ROUTE_EDITOR;
    history.pushState(null, '', editorURL.href);
    this.setState({ isEditorOpen: true, isBatchEditorOpen: false });
  };

  private openBatchEditor = () => {
    if (this.state.isBatchEditorOpen) return;
    const editorURL = new URL(location.href);
    editorURL.pathname = '/batch-editor';
    history.pushState(null, '', editorURL.href);
    this.setState({ isBatchEditorOpen: true, isEditorOpen: false });
  };

  render(
    {}: Props,
    { file, files, isEditorOpen, isBatchEditorOpen, Compress, BatchCompress, awaitingShareTarget }: State,
  ) {
    const showSpinner = awaitingShareTarget || (isEditorOpen && !Compress) || (isBatchEditorOpen && !BatchCompress);

    return (
      <div class={style.app}>
        <file-drop onfiledrop={this.onFileDrop} class={style.drop} multiple>
          {showSpinner ? (
            <loading-spinner class={style.appLoader} />
          ) : isBatchEditorOpen ? (
            BatchCompress && files && (
              <BatchCompress files={files} showSnack={this.showSnack} onBack={back} />
            )
          ) : isEditorOpen ? (
            Compress && (
              <Compress file={file!} showSnack={this.showSnack} onBack={back} />
            )
          ) : (
            <Intro onFile={this.onIntroPickFile} onFiles={this.onIntroPickFiles} showSnack={this.showSnack} />
          )}
          <snack-bar ref={linkRef(this, 'snackbar')} />
        </file-drop>
      </div>
    );
  }
}
