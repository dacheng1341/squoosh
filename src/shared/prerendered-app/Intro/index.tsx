import { h, Component } from 'preact';

import { linkRef } from 'shared/prerendered-app/util';
import '../../custom-els/loading-spinner';
import logo from 'url:./imgs/logo.svg';
import githubLogo from 'url:./imgs/github-logo.svg';
import largePhoto from 'url:./imgs/demos/demo-large-photo.jpg';
import artwork from 'url:./imgs/demos/demo-artwork.jpg';
import deviceScreen from 'url:./imgs/demos/demo-device-screen.png';
import largePhotoIcon from 'url:./imgs/demos/icon-demo-large-photo.jpg';
import artworkIcon from 'url:./imgs/demos/icon-demo-artwork.jpg';
import deviceScreenIcon from 'url:./imgs/demos/icon-demo-device-screen.jpg';
import smallSectionAsset from 'url:./imgs/info-content/small.svg';
import simpleSectionAsset from 'url:./imgs/info-content/simple.svg';
import secureSectionAsset from 'url:./imgs/info-content/secure.svg';
import logoIcon from 'url:./imgs/demos/icon-demo-logo.png';
import logoWithText from 'data-url-text:./imgs/logo-with-text.svg';
import * as style from './style.css';
import type SnackBarElement from 'shared/custom-els/snack-bar';
import 'shared/custom-els/snack-bar';
import { startBlobs } from './blob-anim/meta';
import SlideOnScroll from './SlideOnScroll';

const demos = [
  {
    description: '大尺寸照片',
    size: '2.8MB',
    filename: 'photo.jpg',
    url: largePhoto,
    iconUrl: largePhotoIcon,
  },
  {
    description: '艺术插画',
    size: '2.9MB',
    filename: 'art.jpg',
    url: artwork,
    iconUrl: artworkIcon,
  },
  {
    description: '设备截图',
    size: '1.6MB',
    filename: 'pixel3.png',
    url: deviceScreen,
    iconUrl: deviceScreenIcon,
  },
  {
    description: 'SVG 图标',
    size: '13KB',
    filename: 'squoosh.svg',
    url: logo,
    iconUrl: logoIcon,
  },
] as const;

const blobAnimImport =
  !__PRERENDER__ && matchMedia('(prefers-reduced-motion: reduce)').matches
    ? undefined
    : import('./blob-anim');
const installButtonSource = 'introInstallButton-Purple';
const supportsClipboardAPI =
  !__PRERENDER__ && navigator.clipboard && navigator.clipboard.read;

async function getImageClipboardItem(
  items: ClipboardItem[],
): Promise<undefined | Blob> {
  for (const item of items) {
    const type = item.types.find((type) => type.startsWith('image/'));
    if (type) return item.getType(type);
  }
}

interface Props {
  onFile?: (file: File) => void;
  onFiles?: (files: File[]) => void;
  showSnack?: SnackBarElement['showSnackbar'];
}
interface State {
  fetchingDemoIndex?: number;
  beforeInstallEvent?: BeforeInstallPromptEvent;
  showBlobSVG: boolean;
}

export default class Intro extends Component<Props, State> {
  state: State = {
    showBlobSVG: true,
  };
  private fileInput?: HTMLInputElement;
  private blobCanvas?: HTMLCanvasElement;
  private installingViaButton = false;

  componentDidMount() {
    import('client/utils/analytics').then(({ refreshAds }) => refreshAds());

    // Listen for beforeinstallprompt events, indicating Squoosh is installable.
    window.addEventListener(
      'beforeinstallprompt',
      this.onBeforeInstallPromptEvent,
    );

    // Listen for the appinstalled event, indicating Squoosh has been installed.
    window.addEventListener('appinstalled', this.onAppInstalled);

    if (blobAnimImport) {
      blobAnimImport.then((module) => {
        this.setState(
          {
            showBlobSVG: false,
          },
          () => module.startBlobAnim(this.blobCanvas!),
        );
      });
    }
  }

  componentWillUnmount() {
    window.removeEventListener(
      'beforeinstallprompt',
      this.onBeforeInstallPromptEvent,
    );
    window.removeEventListener('appinstalled', this.onAppInstalled);
  }

  private onFileChange = (event: Event): void => {
    const fileInput = event.target as HTMLInputElement;
    if (!fileInput.files || fileInput.files.length === 0) return;
    const filesArray = Array.from(fileInput.files);
    
    // GA4 Custom Event Tracking
    import('client/utils/analytics').then(({ trackEvent }) => {
      trackEvent('image-selected', { count: filesArray.length });
    });

    this.fileInput!.value = '';
    if (this.props.onFiles) {
      this.props.onFiles(filesArray);
    } else if (this.props.onFile) {
      this.props.onFile(filesArray[0]);
    }
  };

  private onOpenClick = () => {
    this.fileInput!.click();
  };

  private onDemoClick = async (index: number, event: Event) => {
    try {
      this.setState({ fetchingDemoIndex: index });
      const demo = demos[index];
      const blob = await fetch(demo.url).then((r) => r.blob());
      const file = new File([blob], demo.filename, { type: blob.type });
      this.props.onFile!(file);
    } catch (err) {
      this.setState({ fetchingDemoIndex: undefined });
      this.props.showSnack!('获取演示图片失败，请检查网络');
    }
  };

  private onBeforeInstallPromptEvent = (event: BeforeInstallPromptEvent) => {
    // Don't show the mini-infobar on mobile
    event.preventDefault();

    // Save the beforeinstallprompt event so it can be called later.
    this.setState({ beforeInstallEvent: event });

    // Log the event.
    const gaEventInfo = {
      eventCategory: 'pwa-install',
      eventAction: 'promo-shown',
      nonInteraction: true,
    };
    ga('send', 'event', gaEventInfo);
  };

  private onInstallClick = async (event: Event) => {
    // Get the deferred beforeinstallprompt event
    const beforeInstallEvent = this.state.beforeInstallEvent;
    // If there's no deferred prompt, bail.
    if (!beforeInstallEvent) return;

    this.installingViaButton = true;

    // Show the browser install prompt
    beforeInstallEvent.prompt();

    // Wait for the user to accept or dismiss the install prompt
    const { outcome } = await beforeInstallEvent.userChoice;
    // Send the analytics data
    const gaEventInfo = {
      eventCategory: 'pwa-install',
      eventAction: 'promo-clicked',
      eventLabel: installButtonSource,
      eventValue: outcome === 'accepted' ? 1 : 0,
    };
    ga('send', 'event', gaEventInfo);

    // If the prompt was dismissed, we aren't going to install via the button.
    if (outcome === 'dismissed') {
      this.installingViaButton = false;
    }
  };

  private onAppInstalled = () => {
    // We don't need the install button, if it's shown
    this.setState({ beforeInstallEvent: undefined });

    // Don't log analytics if page is not visible
    if (document.hidden) return;

    // Try to get the install, if it's not set, use 'browser'
    const source = this.installingViaButton ? installButtonSource : 'browser';
    ga('send', 'event', 'pwa-install', 'installed', source);

    // Clear the install method property
    this.installingViaButton = false;
  };

  private onPasteClick = async () => {
    let clipboardItems: ClipboardItem[];

    try {
      clipboardItems = await navigator.clipboard.read();
    } catch (err) {
      this.props.showSnack!('无法访问剪贴板，请检查浏览器权限');
      return;
    }

    const blob = await getImageClipboardItem(clipboardItems);

    if (!blob) {
      this.props.showSnack!('剪贴板中没有找到图片');
      return;
    }

    this.props.onFile!(new File([blob], 'image.unknown'));
  };

  render(
    {}: Props,
    { fetchingDemoIndex, beforeInstallEvent, showBlobSVG }: State,
  ) {
    return (
      <div class={style.intro}>
        <input
          class={style.hide}
          ref={linkRef(this, 'fileInput')}
          type="file"
          multiple
          accept="image/*,.zip"
          onChange={this.onFileChange}
        />
        <div class={style.main}>
          {!__PRERENDER__ && (
            <canvas
              ref={linkRef(this, 'blobCanvas')}
              class={style.blobCanvas}
            />
          )}
          <button class={style.batchBtn} onClick={this.onOpenClick}>
            ✨ 批量压缩 / ZIP
          </button>
          <h1 class={style.logoContainer}>
            <img
              class={style.logo}
              src={logoWithText}
              alt="Squoosh"
              width="539"
              height="162"
            />
          </h1>
          <div class={style.loadImg}>
            {showBlobSVG && (
              <svg
                class={style.blobSvg}
                viewBox="-1.25 -1.25 2.5 2.5"
                preserveAspectRatio="xMidYMid slice"
              >
                {startBlobs.map((points) => (
                  <path
                    d={points
                      .map((point, i) => {
                        const nextI = i === points.length - 1 ? 0 : i + 1;
                        let d = '';
                        if (i === 0) {
                          d += `M${point[2]} ${point[3]}`;
                        }
                        return (
                          d +
                          `C${point[4]} ${point[5]} ${points[nextI][0]} ${points[nextI][1]} ${points[nextI][2]} ${points[nextI][3]}`
                        );
                      })
                      .join('')}
                  />
                ))}
              </svg>
            )}
            <div
              class={style.loadImgContent}
              style={{ visibility: __PRERENDER__ ? 'hidden' : '' }}
            >
              <button class={style.loadBtn} onClick={this.onOpenClick}>
                <svg viewBox="0 0 24 24" class={style.loadIcon}>
                  <path d="M19 7v3h-2V7h-3V5h3V2h2v3h3v2h-3zm-3 4V8h-3V5H5a2 2 0 00-2 2v12c0 1.1.9 2 2 2h12a2 2 0 002-2v-8h-3zM5 19l3-4 2 3 3-4 4 5H5z" />
                </svg>
              </button>
              <div>
                <span class={style.dropText}>拖入 </span>或{' '}
                {supportsClipboardAPI ? (
                  <button class={style.pasteBtn} onClick={this.onPasteClick}>
                    粘贴
                  </button>
                ) : (
                  '粘贴'
                )}
              </div>
            </div>
          </div>
        </div>
        {/* AdSense Placeholder */}
        {!__PRERENDER__ && (
          <div style={{ margin: '20px auto', width: '100%', maxWidth: '800px', textAlign: 'center', minHeight: '90px' }}>
            <ins class="adsbygoogle"
                 style={{ display: 'block' }}
                 data-ad-client="ca-pub-XXXXXXXXXXXXXXXX"
                 data-ad-slot="XXXXXXXXXX"
                 data-ad-format="auto"
                 data-full-width-responsive="true"></ins>
          </div>
        )}
        <div class={style.demosContainer}>
          <svg viewBox="0 0 1920 140" class={style.topWave}>
            <path
              d="M1920 0l-107 28c-106 29-320 85-533 93-213 7-427-36-640-50s-427 0-533 7L0 85v171h1920z"
              class={style.subWave}
            />
            <path
              d="M0 129l64-26c64-27 192-81 320-75 128 5 256 69 384 64 128-6 256-80 384-91s256 43 384 70c128 26 256 26 320 26h64v96H0z"
              class={style.mainWave}
            />
          </svg>
          <div class={style.contentPadding}>
            <p class={style.demoTitle}>
              或 <strong>试试</strong> 这些演示图片：
            </p>
            <ul class={style.demos}>
              {demos.map((demo, i) => (
                <li>
                  <button
                    class="unbutton"
                    onClick={(event) => this.onDemoClick(i, event)}
                  >
                    <div class={style.demoContainer}>
                      <div class={style.demoIconContainer}>
                        <img
                          class={style.demoIcon}
                          src={demo.iconUrl}
                          alt={demo.description}
                        />
                        {fetchingDemoIndex === i && (
                          <div class={style.demoLoader}>
                            <loading-spinner />
                          </div>
                        )}
                      </div>
                      <div class={style.demoSize}>{demo.size}</div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div class={style.bottomWave}>
          <svg viewBox="0 0 1920 79" class={style.topWave}>
            <path
              d="M0 59l64-11c64-11 192-34 320-43s256-5 384 4 256 23 384 34 256 21 384 14 256-30 320-41l64-11v94H0z"
              class={style.infoWave}
            />
          </svg>
        </div>

        <section class={style.info}>
          <div class={style.infoContainer}>
            <SlideOnScroll>
              <div class={style.infoContent}>
                <div class={style.infoTextWrapper}>
                  <h2 class={style.infoTitle}>更小体积</h2>
                  <p class={style.infoCaption}>
                    图片越小，加载越快。Squoosh 能大幅缩减文件体积，
                    同时保持高画质。
                  </p>
                </div>
                <div class={style.infoImgWrapper}>
                  <img
                    class={style.infoImg}
                    src={smallSectionAsset}
                    alt="一张 1.4MB 的大图被压缩成 80KB 小图的示意"
                    width="536"
                    height="522"
                  />
                </div>
              </div>
            </SlideOnScroll>
          </div>
        </section>

        <section class={style.info}>
          <div class={style.infoContainer}>
            <SlideOnScroll>
              <div class={style.infoContent}>
                <div class={style.infoTextWrapper}>
                  <h2 class={style.infoTitle}>操作简单</h2>
                  <p class={style.infoCaption}>
                    打开图片，对比效果，一键保存。
                    想更进一步？调整参数可以压缩得更小。
                  </p>
                </div>
                <div class={style.infoImgWrapper}>
                  <img
                    class={style.infoImg}
                    src={simpleSectionAsset}
                    alt="展示多种压缩选项的图片网格"
                    width="538"
                    height="384"
                  />
                </div>
              </div>
            </SlideOnScroll>
          </div>
        </section>

        <section class={style.info}>
          <div class={style.infoContainer}>
            <SlideOnScroll>
              <div class={style.infoContent}>
                <div class={style.infoTextWrapper}>
                  <h2 class={style.infoTitle}>安全私密</h2>
                  <p class={style.infoCaption}>
                    担心隐私？放心，Squoosh 完全在本地处理图片，
                    数据不会上传到任何服务器。
                  </p>
                </div>
                <div class={style.infoImgWrapper}>
                  <img
                    class={style.infoImg}
                    src={secureSectionAsset}
                    alt="带有禁止符号的云图标，表示不上传数据"
                    width="498"
                    height="333"
                  />
                </div>
              </div>
            </SlideOnScroll>
          </div>
        </section>

        <section class={style.info}>
          <div class={style.infoContainer} style={{ maxWidth: '800px', margin: '40px auto', padding: '0 20px', color: 'var(--text, #333)' }}>
            <h2 style={{ fontSize: '1.8rem', marginBottom: '20px', color: 'var(--primary, #ff3385)' }}>什么是纯本地无损图片压缩？</h2>
            <p style={{ lineHeight: '1.6', marginBottom: '20px' }}>
              在传统的图片压缩网站中，您需要将图片上传到远端服务器，服务器处理完后再下载到您的电脑中。这不仅受制于网络速度，而且存在极大的隐私泄露风险。
              <strong>Squoosh 采用了革命性的 WebAssembly (WASM) 技术</strong>，将原本在服务器上运行的图像处理算法，直接搬到了您的浏览器中运行。
              这意味着，您的图片<strong>永远不会离开您的设备</strong>，所有的压缩计算都在您的本地内存中瞬间完成，这不仅快如闪电，更提供了 100% 的绝对隐私保护。
            </p>
            <h3 style={{ fontSize: '1.4rem', marginBottom: '15px' }}>新一代格式 WebP 与 AVIF 的优势</h3>
            <p style={{ lineHeight: '1.6', marginBottom: '20px' }}>
              为什么我们压缩出来的图片又小又清晰？除了传统的 JPEG 和 PNG 优化器，我们还内置了 Google 和各大科技巨头主推的下一代图像编码格式：<strong>WebP</strong> 和 <strong>AVIF</strong>。
              相比于传统的 JPEG，WebP 可以将图片体积再缩小约 30%，而基于 AV1 视频编码架构的 AVIF 格式，甚至能在保持同等画质的前提下，将体积缩减到原本的 50% 以下！
              非常适合博客站长、前端开发者和有批量处理需求的设计师使用。
            </p>
            <h3 style={{ fontSize: '1.4rem', marginBottom: '15px' }}>我们支持哪些进阶功能？</h3>
            <p style={{ lineHeight: '1.6', marginBottom: '40px' }}>
              除了基础的格式转换，您还可以自由调节图片的压缩率 (Quality)、平滑度 (Smoothing)，甚至可以改变图片的颜色通道。我们特有的<strong>分屏实时对比功能</strong>，让您可以在保存前直观地查看“压缩前”与“压缩后”的每一个像素差异。
              如果您有大量图片，我们也提供强大的<strong>批量压缩与打包下载</strong>功能，让您一次性完成工作流。
            </p>
          </div>
        </section>

        <footer class={style.footer}>
          <div class={style.footerContainer}>
            <svg viewBox="0 0 1920 79" class={style.topWave}>
              <path
                d="M0 59l64-11c64-11 192-34 320-43s256-5 384 4 256 23 384 34 256 21 384 14 256-30 320-41l64-11v94H0z"
                class={style.footerWave}
              />
            </svg>
            <div class={style.footerPadding}>
              <footer class={style.footerItems}>
                <span class={style.footerLink}>
                  🔒 大程工具箱：纯本地浏览器运算，绝不上传您的任何图片与隐私数据。
                </span>
              </footer>
            </div>
          </div>
        </footer>
        {beforeInstallEvent && (
          <button class={style.installBtn} onClick={this.onInstallClick}>
            安装应用
          </button>
        )}
      </div>
    );
  }
}
