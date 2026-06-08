import { h, Component } from 'preact';
import * as style from './style.css';
import 'add-css:./style.css';

export interface BatchItemProps {
  file: File;
  compressedFile?: File;
  loading: boolean;
  error?: string;
}

function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export default class BatchItem extends Component<BatchItemProps> {
  render({ file, compressedFile, loading, error }: BatchItemProps) {
    const originalSize = file.size;
    let compressRate = '';
    
    if (compressedFile) {
      const diff = compressedFile.size - originalSize;
      const percent = ((diff / originalSize) * 100).toFixed(1);
      compressRate = diff > 0 ? `+${percent}%` : `${percent}%`;
    }

    return (
      <div class={style.batchItem}>
        <div class={style.itemInfo}>
          <div class={style.fileName} title={file.name}>{file.name}</div>
          <div class={style.fileSize}>
            {formatSize(originalSize)}
            {compressedFile && (
              <span class={style.compressedInfo}>
                <span class={style.arrow}>&rarr;</span>
                {formatSize(compressedFile.size)}
                <span class={style.rate + ' ' + (compressedFile.size > originalSize ? style.rateBad : style.rateGood)}>
                  ({compressRate})
                </span>
              </span>
            )}
          </div>
        </div>
        <div class={style.itemStatus}>
          {loading && <div class={style.loader}>处理中...</div>}
          {error && <div class={style.error}>{error}</div>}
          {compressedFile && <div class={style.done}>完成</div>}
          {!loading && !compressedFile && !error && <div class={style.pending}>等待中</div>}
        </div>
      </div>
    );
  }
}
