import App from './root.tsrx';

globalThis.dispatchEvent(new CustomEvent('async-resumable:fixture', { detail: App.source }));
