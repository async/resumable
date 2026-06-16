import { describe, expect, test } from 'vitest';
import { stripEmptyVitePreloadWrappers } from '../src/build/preload-cleanup.ts';

describe('Vite preload cleanup', () => {
	test('removes empty dynamic import preload wrappers without touching the import', () => {
		const code =
			'async function load(id){switch(id){case"symbol:0":return p(()=>import("./async-a.js").then((mod)=>mod.symbol_0),[]);case"symbol:1":return p(()=>import("./async-b.js").then((mod)=>mod.symbol_1),[],import.meta.url)}}';

		expect(stripEmptyVitePreloadWrappers(code)).toBe(
			'async function load(id){switch(id){case"symbol:0":return import("./async-a.js").then((mod)=>mod.symbol_0);case"symbol:1":return import("./async-b.js").then((mod)=>mod.symbol_1)}}',
		);
	});

	test('keeps non-empty preload wrappers so dependency preloading still works', () => {
		const code =
			'const route=()=>p(()=>import("./route.js").then((mod)=>mod.default),["route.css"],import.meta.url);';

		expect(stripEmptyVitePreloadWrappers(code)).toBe(code);
	});

	test('removes the unused minified Vite helper after empty wrappers are gone', () => {
		const code =
			'import{__esmMin as e}from"./shared.js";var A=e((()=>{})),O,k,S,p,M=e((()=>{O=(function(){let e=typeof document<`u`&&document.createElement(`link`).relList;return e&&e.supports&&e.supports(`modulepreload`)?`modulepreload`:`preload`})(),k=function(e){return`/`+e},S={},p=function(e,t,n){let r=Promise.resolve();function i(e){let t=new Event(`vite:preloadError`,{cancelable:!0});if(t.payload=e,window.dispatchEvent(t),!t.defaultPrevented)throw e}return r.then(t=>e().catch(i))}}));async function load(id){return p(()=>import("./chunk.js").then(e=>e.symbol),[],import.meta.url)}var F=e((()=>{M()})),I=e((()=>{F()}));e((()=>{A(),I()}))();';

		expect(stripEmptyVitePreloadWrappers(code)).toBe(
			'import{__esmMin as e}from"./shared.js";var A=e((()=>{}));async function load(id){return import("./chunk.js").then(e=>e.symbol)}e((()=>{A()}))();',
		);
	});
});
