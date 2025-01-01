import * as L from "npm:list";

export type pizmonimOrgLinkFetcherReturn = Record<string, URL>
export type TehilimPsalm = {
	firstWords?: string;
	location?: string;
	recordings: pizmonimOrgLinkFetcherReturn
}

export interface TanakhObject {
	link: string;
	sections: { english: string; hebrew: string; };
	description?: string;
}

export type ParashaBooks =
	"בראשית" | "שמות" | "ויקרא" | "במדבר" | "דברים" |
	"ספר בראשית" | "ספר שמות" | "ספר ויקרא" | "ספר במדבר" | "ספר דברים" | '';
export type IndParashaRecording = { url: URL | string, part?: string }
export type ParashaListing = {
	title: { english: L.List<string>, hebrew: L.List<string> };
	sourceBook?: Record<ParashaBooks, string>;
	topic?: Set<string>;
	longDescription?: Record<string, { title: string; description: string }[]>;
	makamTable?: Record<string, string>;
	recordings?: Record<string, IndParashaRecording[]>;
}