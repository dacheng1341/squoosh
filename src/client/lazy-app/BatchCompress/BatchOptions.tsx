import { h, Component } from 'preact';

import * as style from './style.css';
import 'add-css:./style.css';
import { cleanSet, cleanMerge } from '../util/clean-modify';

import {
  EncoderOptions,
  EncoderState,
  ProcessorState,
  ProcessorOptions,
  encoderMap,
} from '../feature-meta';
import type { OutputType } from '../Compress';
import Expander from '../Compress/Options/Expander';
import Toggle from '../Compress/Options/Toggle';
import Select from '../Compress/Options/Select';
import { Options as QuantOptionsComponent } from 'features/processors/quantize/client';
import { Options as ResizeOptionsComponent } from 'features/processors/resize/client';

interface Props {
  encoderState?: EncoderState;
  processorState: ProcessorState;
  onEncoderTypeChange(newType: OutputType): void;
  onEncoderOptionsChange(newOptions: EncoderOptions): void;
  onProcessorOptionsChange(newOptions: ProcessorState): void;
}

interface State {
  supportedEncoderMap?: PartialButNotUndefined<typeof encoderMap>;
}

type PartialButNotUndefined<T> = {
  [P in keyof T]: T[P];
};

const supportedEncoderMapP: Promise<PartialButNotUndefined<typeof encoderMap>> =
  (async () => {
    const supportedEncoderMap: PartialButNotUndefined<typeof encoderMap> = {
      ...encoderMap,
    };

    await Promise.all(
      Object.entries(encoderMap).map(async ([encoderName, details]) => {
        if ('featureTest' in details && !(await details.featureTest())) {
          delete supportedEncoderMap[encoderName as keyof typeof encoderMap];
        }
      }),
    );

    return supportedEncoderMap;
  })();

export default class BatchOptions extends Component<Props, State> {
  state: State = {
    supportedEncoderMap: undefined,
  };

  constructor() {
    super();
    supportedEncoderMapP.then((supportedEncoderMap) =>
      this.setState({ supportedEncoderMap }),
    );
  }

  private onEncoderTypeChange = (event: Event) => {
    const el = event.currentTarget as HTMLSelectElement;
    const type = el.value as OutputType;
    this.props.onEncoderTypeChange(type);
  };

  private onProcessorEnabledChange = (event: Event) => {
    const el = event.currentTarget as HTMLInputElement;
    const processor = el.name.split('.')[0] as keyof ProcessorState;

    this.props.onProcessorOptionsChange(
      cleanSet(this.props.processorState, `${processor}.enabled`, el.checked),
    );
  };

  private onQuantizerOptionsChange = (opts: ProcessorOptions['quantize']) => {
    this.props.onProcessorOptionsChange(
      cleanMerge(this.props.processorState, 'quantize', opts),
    );
  };

  private onResizeOptionsChange = (opts: ProcessorOptions['resize']) => {
    this.props.onProcessorOptionsChange(
      cleanMerge(this.props.processorState, 'resize', opts),
    );
  };

  private onEncoderOptionsChange = (newOptions: EncoderOptions) => {
    this.props.onEncoderOptionsChange(newOptions);
  };

  render(
    { encoderState, processorState }: Props,
    { supportedEncoderMap }: State,
  ) {
    const encoder = encoderState && encoderMap[encoderState.type];
    const EncoderOptionComponent =
      encoder && 'Options' in encoder ? encoder.Options : undefined;

    return (
      <div class={style.batchOptions}>
        <h3 class={style.optionsTitle}>批量压缩设置</h3>
        <section class={style.optionsSection}>
          {supportedEncoderMap ? (
            <Select
              value={encoderState ? encoderState.type : 'identity'}
              onChange={this.onEncoderTypeChange}
              large
            >
              {Object.entries(supportedEncoderMap).map(([type, encoder]) => (
                <option value={type}>{encoder.meta.label}</option>
              ))}
            </Select>
          ) : (
            <Select large>
              <option>加载中…</option>
            </Select>
          )}
        </section>

        <Expander>
          {EncoderOptionComponent && (
            <EncoderOptionComponent
              options={
                encoderState!.options as any
              }
              onChange={this.onEncoderOptionsChange}
            />
          )}
        </Expander>

        <h3 class={style.optionsTitle}>图像编辑</h3>
        <label class={style.sectionEnabler}>
          调整尺寸
          <Toggle
            name="resize.enable"
            checked={!!processorState.resize.enabled}
            onChange={this.onProcessorEnabledChange}
          />
        </label>
        <Expander>
          {processorState.resize.enabled ? (
            <ResizeOptionsComponent
              isVector={false}
              inputWidth={1}
              inputHeight={1}
              options={processorState.resize}
              onChange={this.onResizeOptionsChange}
            />
          ) : null}
        </Expander>

        <label class={style.sectionEnabler}>
          减少调色板
          <Toggle
            name="quantize.enable"
            checked={!!processorState.quantize.enabled}
            onChange={this.onProcessorEnabledChange}
          />
        </label>
        <Expander>
          {processorState.quantize.enabled ? (
            <QuantOptionsComponent
              options={processorState.quantize}
              onChange={this.onQuantizerOptionsChange}
            />
          ) : null}
        </Expander>
      </div>
    );
  }
}
