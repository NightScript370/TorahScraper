import { cleanupText } from "./formatter.ts";
import { ParashaBooks } from "./globaltypings.ts";

import * as L from "npm:list";

type reading = { part?: string, url: URL }
export default class ParashaClass {
	title: { english: L.List<string>, hebrew: L.List<string> };
	recordings: Record<string, reading[]>;
	sourceBook: Record<ParashaBooks, string>;
	topics: string[];
	longDescriptions: Record<string, { title: string; description: string }[]>;
	makamTable: Record<string, string>;

	constructor({ english, hebrew }: typeof this.title) {
		this.title = { english: L.list(), hebrew: L.list() };
		this.addEnglishTitle(english);
		this.addHebrewTitles(hebrew);

		this.recordings = {};
		this.sourceBook = {} as Record<ParashaBooks, string>;
		this.topics = [];
		this.longDescriptions = {};
		this.makamTable = {};
	}

	addEnglishTitle(titles: L.List<string>): this {
		this.title.english = L.dropRepeats(L.list(...L.map((title) => cleanupText(title), titles), ...this.title.english));
		return this;
	}

	addHebrewTitles(titles: L.List<string>): this {
		this.title.hebrew = L.dropRepeats(L.list(...L.map((title) => cleanupText(title), titles), ...this.title.hebrew));
		return this;
	}

	addRecording({ author, part, url }: {author: string, part?: string, url: URL|string}): this {
		if (!(author in this.recordings))
			this.recordings[author] = [];

		const recordObj:reading = { url: typeof url === 'string' ? new URL(url) : url };
		if (part)
			recordObj.part = part;

		this.recordings[author].push(recordObj);
		return this;
	}

	includesTitle(language: 'english' | 'hebrew', title: string): boolean {
		return L.includes(
			title.toLowerCase(),
			L.map((langTitle) => langTitle.toLowerCase(), this.title[language])
		);
	}
}