import * as path from 'path';

const { WWW_OUT_DIR } = require('../constants');

export declare namespace SomeTypes {
  type Number = number;
  type String = string;
}

// A set containing the Stencil components that are being actively rendered
const activeRendering = new Set();
// A series of callbacks to invoke once a test page has loaded
const onAppReadyCallbacks: Function[] = [];

/**
 * Helper function to keep track of the custom elements that are being actively rendered by storing a reference to them
 * @param elm the element being rendered to track
 */
function willRender(elm: any): void {
  activeRendering.add(elm);
}

/**
 * Helper function for clearing the data structures used for:
 * - tracking when a custom element is being actively rendered
 * - callbacks for a custom element that has rendered
 * @param elm the element that has rendered
 */
function didRender(elm: any): void {
  activeRendering.delete(elm);
  if (onAppReadyCallbacks.length > 0 && activeRendering.size === 0) {
    // we've got some promises waiting on the entire app to be done processing
    // so it should have an empty queue and no longer rendering
    let cb: Function;
    while ((cb = onAppReadyCallbacks.shift())) {
      cb();
    }
  }
}

/**
 * Helper function to call [`requestAnimationFrame`](https://developer.mozilla.org/en-US/docs/Web/API/window/requestAnimationFrame)
 * @returns a promise to call `requestAnimationFrame`
 */
function waitFrame(): Promise<number> {
  return new Promise((resolve) => {
    requestAnimationFrame(resolve);
  });
}

/**
 * Create setup and teardown methods for dom based tests.
 * @returns the setup and teardown methods.
 */
export function setupDomTests(document: Document): {
  setupDom: typeof setupDom;
  tearDownDom: typeof tearDownDom;
  tearDownStylesScripts: typeof tearDownStylesScripts;
} {
  let testBed = document.getElementById('test-app');
  if (!testBed) {
    testBed = document.createElement('div');
    testBed.id = 'test-app';
    document.body.appendChild(testBed);
  }

  /**
   * Run this before each test suite to setup the DOM for each test in the suite
   * @param url the url to the `index.html` page to render for test(s)
   * @param waitForStencilReadyMs the number of milliseconds to wait for the page to load. Using this parameter will
   * override the default behavior of waiting for the `appload` Stencil event.
   * @returns the rendered DOM for the test(s)
   */
  function setupDom(url: string, waitForStencilReadyMs?: number): Promise<HTMLElement> {
    const app = document.createElement('div');
    activeRendering.clear();
    onAppReadyCallbacks.length = 0;
    app.addEventListener('stencil_componentWillRender', (ev) => willRender(ev.target));
    app.addEventListener('stencil_componentDidRender', (ev) => didRender(ev.target));

    app.className = 'test-spec';
    testBed.appendChild(app);

    if (url) {
      app.setAttribute('data-url', url);
      return renderTest(url, app, waitForStencilReadyMs);
    }

    return Promise.resolve(app);
  }

  /**
   * Run this after each test to clear the DOM
   */
  function tearDownDom(): void {
    if (testBed) {
      testBed.innerHTML = '';
    }
  }

  /**
   * Run this after each test that needs its resources flushed
   */
  function tearDownStylesScripts(): void {
    document.head.querySelectorAll('style[data-styles]').forEach((e) => e.remove());

    [
      '/build/testinvisibleprehydration.esm.js',
      '/build/testinvisibleprehydration.js',
      '/build/testprehydratedtruestyles.esm.js',
      '/build/testprehydratedtruestyles.js',
      '/build/testprehydratedfalsestyles.esm.js',
      '/build/testprehydratedfalsestyles.js',
      '/build/testapp.esm.js',
      '/build/testapp.js',
    ].forEach((src) => {
      document.querySelectorAll(`script[src="${src}"]`).forEach((e) => e.remove());
    });
  }

  /**
   * Create the DOM containing the web component(s) for executing tests against
   * @param url the url to the `index.html` page to render for tests
   * @param app an HTMLElement that the rendered test content can be attached to
   * @param waitForStencilReadyMs the number of milliseconds to wait for the page to load. Using this parameter will
   * override the default behavior of waiting for the `appload` Stencil event.
   * @returns the rendered DOM for the test
   */
  function renderTest(url: string, app: HTMLElement, waitForStencilReadyMs: number): Promise<HTMLElement> {
    url = path.join('base', WWW_OUT_DIR, url);

    return new Promise<HTMLElement>((resolve, reject) => {
      try {
        /**
         * Walk the current test's page, collecting all instances of `componentOnReady` on a custom element.
         * @returns the return values of `componentOnReady` after they have all resolved. Returns nothing if any of the
         * `componentOnReady` calls fails to resolve.
         */
        const allReady = async (): Promise<any[] | void> => {
          const promises: Promise<any>[] = [];
          const waitForDidLoad = (promises: Promise<any>[], elm: Element): void => {
            // only inspect elements whose `nodeTpe` is `Node.ELEMENT_NODE`
            if (elm != null && elm.nodeType === 1) {
              for (let i = 0; i < elm.children.length; i++) {
                const childElm = elm.children[i];
                if (childElm.tagName.includes('-') && typeof (childElm as any).componentOnReady === 'function') {
                  promises.push((childElm as any).componentOnReady());
                }
                waitForDidLoad(promises, childElm);
              }
            }
          };

          waitForDidLoad(promises, window.document.documentElement);

          try {
            return Promise.all(promises);
          } catch (e) {
            return console.error(e);
          }
        };

        /**
         * Helper function to verify that all Stencil components have loaded
         * @returns the return values of `componentOnReady` after they have all resolved. Returns nothing if any of the
         * `componentOnReady` calls fails to resolve.
         */
        const stencilReady = async (): Promise<any[] | void> => {
          await allReady();
          await waitFrame();
          return await allReady();
        };

        /**
         * Helper function to be attached to a 'load' event listener
         * @params this an `XMLHttpRequest` received as a part of the event listener firing
         */
        const indexLoaded = function (this: XMLHttpRequest): void {
          if (this.status !== 200) {
            reject(`404: ${url}`);
            return;
          }
          // create a document fragment with the `responseText` from the request, which should contain a test's
          // `index.html` contents
          const frag = document.createDocumentFragment();
          const elm = document.createElement('div');
          elm.innerHTML = this.responseText;
          frag.appendChild(elm);
          app.innerHTML = elm.innerHTML;

          const tmpScripts: NodeListOf<HTMLScriptElement> = app.querySelectorAll('script');
          for (let i = 0; i < tmpScripts.length; i++) {
            const script: HTMLScriptElement = document.createElement('script');
            if (tmpScripts[i].src) {
              script.src = tmpScripts[i].src;
            }
            if (tmpScripts[i].hasAttribute('nomodule')) {
              script.setAttribute('nomodule', '');
            }
            if (tmpScripts[i].hasAttribute('type')) {
              script.setAttribute('type', tmpScripts[i].getAttribute('type')!);
            }
            script.innerHTML = tmpScripts[i].innerHTML;

            tmpScripts[i].parentNode!.insertBefore(script, tmpScripts[i]);
            tmpScripts[i].parentNode!.removeChild(tmpScripts[i]);
          }

          elm.innerHTML = '';

          if (typeof waitForStencilReadyMs === 'number') {
            setTimeout(() => {
              resolve(app);
            }, waitForStencilReadyMs);
          } else {
            /**
             * Callback to fire when the Stencil `appload` event has fired
             */
            const appLoad = () => {
              window.removeEventListener('appload', appLoad);
              stencilReady().then(() => {
                resolve(app);
              });
            };
            window.addEventListener('appload', appLoad);
          }
        };

        const oReq = new XMLHttpRequest();
        oReq.addEventListener('load', indexLoaded);
        oReq.addEventListener('error', (err) => {
          console.error('error oReq.addEventListener', err);
          reject(err);
        });
        oReq.open('GET', url);
        oReq.send();
      } catch (e) {
        console.error('catch error', e);
        reject(e);
      }
    });
  }

  return { setupDom, tearDownDom, tearDownStylesScripts };
}

/**
 * Function that collects callbacks to be invoked when the page has loaded
 * @param callback the callback, which may be immediately invoked if there is no component being actively rendered, or
 * stored until such time
 */
function onReady(callback: Function): void {
  if (activeRendering.size === 0) {
    callback();
  } else {
    onAppReadyCallbacks.push(callback);
  }
}

/**
 * Wait for the component to asynchronously update
 * @param timeoutMs the time in milliseconds to wait
 */
export function waitForChanges(timeoutMs = 250): Promise<void> {
  const win = window as any;

  return new Promise((resolve) => {
    function pageLoaded() {
      setTimeout(() => {
        onReady(resolve);
      }, timeoutMs);
    }

    if (document.readyState === 'complete') {
      pageLoaded();
    } else {
      win.addEventListener('load', pageLoaded, false);
    }
  });
}
