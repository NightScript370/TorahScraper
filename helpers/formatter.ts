import { JSDOM } from "npm:jsdom";

import { pizmonimOrgLinkFetcherReturn } from './globaltypings.ts';

export const textFetch = async (url:URL, options?:RequestInit):Promise<string> => (await (await fetch(url.href, options || {})).text());
export const TextDom = (html:string):Document => (new JSDOM(html)).window.document;
export const URLDom = async (url:URL, options?:RequestInit):Promise<Document> => TextDom(await textFetch(url, options));
export const fixEncodeFetch = async (url:URL, options?:RequestInit):Promise<string> => {
	const response = await fetch(url.href, options || {});
	const buffer = await response.arrayBuffer();
	const decoder = new TextDecoder('iso-8859-1');
	return decoder.decode(buffer);
};

// deno-lint-ignore no-explicit-any
function arrayChunker (originalArray:any[], separator:any, mapper:string) {
	const chunkholderArray = [];
	let tempArray = [];

	for (const value of originalArray) {
		if (value[mapper] !== separator) {
			tempArray.push(value);
			continue;
		}

		chunkholderArray.push(tempArray);
		tempArray = [];
	}

	return chunkholderArray;
}

export const cleanupText = (string:string) => {
	string = string.replace(/(<([^>]+)>)/ig, ' ').replaceAll('&nbsp;', ' ').replace(/[\n\r\t]/g, ' ')
	while (string.includes('  '))
		string = string.replaceAll('  ', ' ')
	return string.trim();
}

export const sameArrayContents = (array1:Array<unknown>, array2:Array<unknown>) => {
	const set1 = Array.from(new Set(array1));
	const set2 = Array.from(new Set(array2));

	return (set1.length == set2.length && set1.every(entry => set2.includes(entry)) && set2.every(entry => set1.includes(entry)))
}

export const getCommonArray = (array1:Array<unknown>, array2:Array<unknown>, overide = true) =>
	Array.from(new Set([...array1, ...array2]))
		.filter(entry => array1.includes(entry) == overide && array2.includes(entry) == overide);

export function getCommonObject(obj1:Record<string, unknown>, obj2:Record<string, unknown>, overide = true) {
	let common:Set<[string, unknown]> = new Set();

	const array1 = Object.entries(obj1);
	const array2 = Object.entries(obj2);

	for (const array1Entry of array1) {
		if ((array2.includes(array1Entry)) == overide)
			common = common.add(array1Entry);
	}
	for (const array2Entry of array2) {
		if ((array1.includes(array2Entry)) == overide)
			common = common.add(array2Entry);
	}

	return Object.fromEntries(Array.from(common));
}

export const pizmonimOrgLinkFetcher = async (htmlCell:HTMLTableCellElement, authorPostFormatting?:{(string:string): string}) => {
	/* First check differences between In-Page players or external players
	- Don't assume links are not 
	*/
	const entriesChunk:Array<Array<Node>> = arrayChunker(Array.from(htmlCell.childNodes), 'BR', 'nodeName');
	const recordings:pizmonimOrgLinkFetcherReturn = {}
	for (const entries of entriesChunk) {
		const fragment:Element = new JSDOM('').window.document.body;
		for (const entry of entries)
			fragment.appendChild(entry)

		const validLinks = Array.from(fragment.getElementsByTagName('a'))
			.map(anchor => anchor.getAttribute('href')!)
			.filter(link => !link.startsWith('javascript'))

		if (validLinks.find(link => link.toLowerCase().endsWith('.mp3'))
		 || validLinks.find(link => link.toLowerCase().endsWith('.wma'))) {
			const link = new URL(validLinks[0], 'https://pizmonim.com/');

			let child = fragment.lastElementChild; 
			while (child) {
				child.innerHTML = '';
				fragment.removeChild(child);
				child = fragment.lastElementChild;
			}

			recordings[cleanupText(fragment.innerHTML)] = link
			continue;
		}

		let singerName = cleanupText(fragment.innerHTML)
		if (authorPostFormatting)
			singerName = authorPostFormatting(singerName)

		if (singerName == 'Recording')
			singerName = 'pizmonim.com';

		const recordingPage = await URLDom(new URL(validLinks[0]!, 'https://pizmonim.com/'));
		const jPlayerAudioHandlerScript = Array.from(recordingPage.getElementsByTagName('script'))
			.map(script => (script as Element).innerHTML)
			.filter(Boolean)
			.at(-1)!

		const fileInScript = jPlayerAudioHandlerScript
			.split('\n')
			.map(string => string.replace(/[\n\r\t]/g, '').trim())
			.filter(string => string.startsWith(`ready: function() { $(this).jPlayer("setMedia", { mp3:`) && string.endsWith(`}).jPlayer("play") },`))
			[0]
			.replace(`ready: function() { $(this).jPlayer("setMedia", { mp3:`, '')
			.replace(`}).jPlayer("play") },`, '')
			.replace(/['|"]/gm, '')

		recordings[singerName] = new URL(fileInScript, 'https://pizmonim.com/')
	}

	return recordings
}

const gematriaNumberTable:Record<number, Record<number, string>> = {
	3: {
		1: 'ק',
		2: 'ר',
		3: 'ש',
		4: 'ת'
	},
	2: {
		1: 'י',
		2: 'כ',
		3: "ל",
		4: "מ",
		5: "נ",
		6: 'ס',
		7: 'ע',
		8: 'פ',
		9: 'צ'
	},
	1: {
		1: 'א',
		2: 'ב',
		3: "ג",
		4: "ד",
		5: "ה",
		6: 'ו',
		7: 'ז',
		8: 'ח',
		9: 'ט'
	}
}

export const numberToGematria = (number:number):string => {
	let numberArray = number.toString().split('');
	numberArray = numberArray.map((number, index) => {
		if (parseInt(number) == 0)
			return '';

		return gematriaNumberTable[numberArray.length - index][parseInt(number)] || number;
	})

	return numberArray.join('').replace('יה', 'טו').replace('יו', 'טז');
}

export const filenameCharAndReplace:Record<string,string> = Object.assign(
	{
		'|': '׀',
		':': '׃'
	},
	Object.fromEntries(['&nbsp;', '<', '>', '"', "'", '/', '?', '*', String.raw`\ `.trim()]
		.map(entry => [entry, '']))
);

export const hebrewTextFromElement = (elementInnerHTML:string) => cleanupText(elementInnerHTML)
.split(' ')
.filter(Boolean)
.filter(arrayEntry => typeof arrayEntry == 'string')
.filter(wordInSentence => wordInSentence.split('').every(letter => letter.charCodeAt(0) >= 0x590 && letter.charCodeAt(0) <= 0x5FF))
.join(' ')

export const chunks = <T>(items: T[]) =>
items.reduce((chunks: T[][], item: T, index) => {
  const chunk = Math.floor(index / 3);
  chunks[chunk] = ([] as T[]).concat(chunks[chunk] || [], item);
  return chunks;
}, []);

export const extractLearnTefilahDropdown = (document:Document, id:string, multiname=false) => {
	const chategory = Array.from(document.getElementById(id)!.querySelectorAll<HTMLOptionElement>("option:not(.chategory)"));
	const returnArray:[string, string[]][] = [];

	for (const option of chategory) {
		const urlPathSplit = option.getAttribute('value')!.split("/").filter(Boolean);

		if (!multiname) {
			returnArray.push([urlPathSplit.join("/"), [cleanupText(option.innerHTML)]])
			continue;
		}

		let alternativeTitle = "";
		for (let i = (urlPathSplit.length - 1); i > 0; i--) {
			alternativeTitle = urlPathSplit[i]
				.replaceAll(/weekdays|rishon|sheni|shlishi|revii|hamishi|shishi|shevii/g, '')

			while (alternativeTitle.endsWith('-'))
				alternativeTitle = alternativeTitle.substring(0, alternativeTitle.length - 1)

			if (alternativeTitle)
				break;
		}

		returnArray.push([
			urlPathSplit.join('/'),
			[
				cleanupText(option.innerHTML),
				cleanupText(alternativeTitle.replaceAll('-', " ").replace(/(^\w{1})|(\s+\w{1})/g, letter => letter.toUpperCase()))
			]
		])
	}

	return Object.fromEntries(returnArray);
}