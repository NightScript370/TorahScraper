//import python from "https://deno.land/x/python@0.4.3/mod.ts";
import * as L from "npm:list";

// Scraper-Related Functions
import { parseArgs } from "@std/cli/parse-args";
import { cleanupText, URLDom, pizmonimOrgLinkFetcher, hebrewTextFromElement, chunks, extractLearnTefilahDropdown, TextDom, textFetch, fixEncodeFetch } from './helpers/formatter.ts';

//import * as path from "@std/path/mod.ts";

// Typings
import { /*pizmonimOrgLinkFetcherReturn,*/ TehilimPsalm, /*TanakhObject,*/ ParashaBooks, ParashaListing, IndParashaRecording } from './helpers/globaltypings.ts';
import ParashaClass from "./helpers/parashaClass.ts";

// Data
//import clearDafCookies from './helpers/clearDafCookies.ts'

const mergeArrayOptions = (masterArray:L.List<ParashaClass>, findData:ParashaListing) => {
	const mp3FilesIndexer = L.filter(
		(entry) =>
			L.some(title => entry.includesTitle('hebrew', title), findData.title.hebrew)
		 || L.some(title => entry.includesTitle('english', title), findData.title.english),
		masterArray
	);

	switch (Math.min(mp3FilesIndexer.length, 3)) {
		case 0: {
			console.log("New entry:", Object.fromEntries(Object.entries(findData.title).map(([key, value]) => [key, value.toJSON()])))
			const newParasha = new ParashaClass({ english: findData.title.english, hebrew: findData.title.hebrew })
			newParasha.sourceBook = findData.sourceBook || ({} as Record<ParashaBooks, string>);
			newParasha.makamTable = findData.makamTable || {};
			newParasha.topics = Array.from(findData.topic || []);
			newParasha.longDescriptions = findData.longDescription || {};
			for (const [author, recordings] of Object.entries(findData.recordings || {}))
				for (const recording of recordings)
					newParasha.addRecording({ author, part: recording.part, url: recording.url });

			return L.append(newParasha, masterArray);
		} case 1: {
			console.log("Already had singular entry for:", Object.fromEntries(Object.entries(findData.title).map(([key, value]) => [key, value.toJSON()])))

			const elem = L.toArray(mp3FilesIndexer)[0]
				.addEnglishTitle(findData.title.english)
				.addHebrewTitles(findData.title.hebrew);

			for (const [author, recordings] of Object.entries(findData.recordings || {}))
				for (const recording of recordings)
					elem.addRecording({ author, part: recording.part, url: recording.url });

			elem.topics = [...(findData.topic || []), ...elem.topics];
			elem.longDescriptions = {...(findData.longDescription || {}), ...elem.longDescriptions};
			elem.makamTable = {...(findData.makamTable || {}), ...elem.makamTable};

			if ('sourceBook' in findData) {
				if (!('sourceBook' in elem) || Object.values(elem.sourceBook)[0] == "") {
					elem.sourceBook = findData.sourceBook!;
				} else if (JSON.stringify(findData.sourceBook) !== JSON.stringify(elem.sourceBook)) {
					console.error(findData.sourceBook, elem.sourceBook);
					throw Error('Why are there two different sourceBooks?');
				}
			}

			return masterArray;
		} case 3:
			console.log(findData, mp3FilesIndexer.length, mp3FilesIndexer.toJSON());
			throw Error("What in the world happened? WAIT, AGAIN? " + mp3FilesIndexer.length)
	}

	/* {
		title?: { english?: Set<string>, hebrew?: Set<string> };
		sourceBook?: Record<ParashaBooks, string>;
		topic?: Set<string>;
		longDescription?: Record<string, string>;
		makamTable?: Record<string, string>;
		recordings?: Record<string, Set<IndParashaRecording>>;
	} */

	const listParasha = L.toArray(mp3FilesIndexer);
	listParasha[0]
		.addEnglishTitle(L.list(...findData.title.english, ...listParasha[1].title.english))
		.addHebrewTitles(L.list(...findData.title.hebrew, ...listParasha[1].title.hebrew))

	listParasha[0].topics = [...(findData.topic || []), ...listParasha[0].topics, ...listParasha[1].topics];
	listParasha[0].longDescriptions = {...(findData.longDescription || {}), ...listParasha[0].longDescriptions, ...listParasha[1].longDescriptions};
	listParasha[0].makamTable = {...(findData.makamTable || {}), ...listParasha[0].makamTable, ...listParasha[1].makamTable};


	for (const oldObj of [listParasha[1], findData]) {
		if (('sourceBook' in oldObj)) {
			if (!('sourceBook' in listParasha[0]) || Object.values(listParasha[0].sourceBook)[0] == "") {
				listParasha[0].sourceBook = oldObj.sourceBook!;
			} else if (JSON.stringify(oldObj.sourceBook) !== JSON.stringify(listParasha[0].sourceBook)) {
				console.error(oldObj.sourceBook, listParasha[0].sourceBook);
				throw Error('Why are there two different sourceBooks?');
			}
		}

		for (const [author, recordings] of Object.entries(oldObj.recordings || {}))
			for (const recording of recordings)
				listParasha[0].addRecording({ author, part: recording.part, url: recording.url });
	}

	return L.remove(L.indexOf(listParasha[1], masterArray), 1, masterArray);
}

const writeJson = (filePath:string, o:Record<string, unknown> | Array<unknown> | Set<unknown>) =>
	Deno.writeTextFileSync(filePath, JSON.stringify(
		o,
		(_key, entry) => (typeof entry == 'object' && entry instanceof Set) ? Array.from(entry) : (L.isList(entry) ? L.toArray(entry) : entry),
		"\t"),
	);

const parashaData = [
	'http://www.sephardichazzanut.com/Bereshit.htm',
	'http://www.sephardichazzanut.com/Shemot.htm',
	'http://www.sephardichazzanut.com/Vayikra.htm',
	'http://www.sephardichazzanut.com/Bamidbar.htm',
	'http://www.sephardichazzanut.com/Debarim.htm'
].map(link => new URL(link));
//const TehilimPage = new URL('http://www.sephardichazzanut.com/Tehillim.htm');
//const rootTanakhIndex = new URL('http://www.sephardichazzanut.com/Tanach.htm');

const config = parseArgs(Deno.args, { default: { scrapemode: 'parasha', full: true }})
switch (config.scrapemode) {
	case 'parasha': {
		let mp3Files = L.list<ParashaClass>();

		console.log('PARASHA PART 1: FARAJ SAMRA')
		for (const bookOfMosesLink of parashaData) {
			const bookOfMosesDocument = await URLDom(bookOfMosesLink);
			const bookTitle = hebrewTextFromElement((bookOfMosesDocument.querySelector('table.style30 tr') as HTMLTableRowElement)?.cells[0].innerHTML!)
				.replace("ספר ", '') as ParashaBooks;

			const tableRows = Array.from(bookOfMosesDocument.querySelectorAll<HTMLTableRowElement>('table.style30 tr'))
				.filter(rowElement => !Array.from(rowElement.cells).map(cell => cell.innerHTML).every(string => cleanupText(string) == ''))
				.filter(rowElement => [3,4].includes(rowElement.cells.length))

			const parashaGroups = chunks(tableRows)
			for (const parasha of parashaGroups) {
				const parashaTitle = {
					hebrew: L.list(hebrewTextFromElement(parasha[0].cells[0].innerHTML!)),
					english: L.list(cleanupText(parasha[0].cells[0].innerHTML!)
						.split(' ')
						.filter(string => hebrewTextFromElement(string) == '')
						.join(' '))
				}

				const links = parasha.flat()
					.flatMap(row => Array.from(row.cells))
					.map(cells => cells.querySelector('a')!)
					.filter(Boolean)
					.filter(anchorLink => hebrewTextFromElement(anchorLink?.innerHTML) !== 'הפטרה')

				mp3Files = mergeArrayOptions(mp3Files, {
					title: parashaTitle,
					sourceBook: {[bookTitle]: ''} as Record<ParashaBooks, string>,
					recordings: { "Faraj Samra": links.map(parashaLink => ({
						part: hebrewTextFromElement(parashaLink?.innerHTML!),
						url: new URL(parashaLink.getAttribute('href')!)
					})) },
				})
			}
		}

		console.log('PARASHA PART 2: Pentaneuch')
		const pantateuchIndex = await URLDom(new URL('https://pizmonim.com/section.php?maqam=Pentateuch'));
		const parashaRows = Array.from(pantateuchIndex.querySelectorAll<HTMLTableRowElement>('.MaqamTable tr'))
			.filter(row => row.cells[2].innerHTML.includes('פרשת'));

		// deno-lint-ignore no-inner-declarations
		async function pentateuchParashaExtractor (parashaRow:HTMLTableRowElement) {
			const descriptionElem = parashaRow.cells[3];

			let child = descriptionElem.lastElementChild; 
			while (child) {
				child.innerHTML = '';
				descriptionElem.removeChild(child);
				child = descriptionElem.lastElementChild;
			}

			const descriptionCapture = Array.from(cleanupText(descriptionElem.innerHTML).matchAll(/^(.*) \((.*) (\d{1,2}:\s?\d{1,2}\s?-(?:\s?\d{1,2}:)?\s?\d{1,2})\)\.(?: (.*))?/g))[0]

			const bookTitle = descriptionCapture[2]
				.replaceAll('Genesis', "בראשית")
				.replaceAll('Exodus', "שמות")
				.replaceAll('Leviticus', "ויקרא")
				.replaceAll('Numbers', "במדבר")
				.replaceAll('Deuteronomy', "דברים") as ParashaBooks;

			const parashaNames = { hebrew: L.list(hebrewTextFromElement(parashaRow.cells[2].innerHTML)
				.replace('פרשת', '')
				.trim()), english: L.list(cleanupText(descriptionCapture[1])) }

			const recordings = {} as Record<string, IndParashaRecording[]>;
			Object.entries(await pizmonimOrgLinkFetcher(
				parashaRow.cells[4],
				string => string
					.split('-')
					.map(separatedEntry => separatedEntry.replace(Array.from(parashaNames.english)[0], '').replace('Full', '').trim())
					.filter(Boolean)
					.join(' - ')
			)).forEach(([author, link]) => {
				const object:IndParashaRecording = { "url": link };
				//const textField = Array.from(parashaRow.cells[4].querySelectorAll('a'))
				//	.find(anchorLink => cleanupText(anchorLink.innerHTML).includes(author))
				//	?.innerHTML

				//if (textField?.toLowerCase().includes('full'))
				if (link.href.toLowerCase().includes('full'))
					object.part = 'הכל';

				if (!(author in recordings))
					recordings[author] = [];
				
				recordings[author].push(object);
			});

			mp3Files = mergeArrayOptions(mp3Files, {
				title: parashaNames,
				sourceBook: {[bookTitle]: (parashaNames.hebrew.toJSON()[0] == "תצוה" ? "27:20-30:10" : descriptionCapture[3]
					.split('-').map(entry => entry.trim()).join('-')
					.split(':').map(entry => entry.trim()).join(':'))} as Record<ParashaBooks, string>,
				topic: new Set([descriptionCapture[4]]),
				recordings
			});
			const indexFinder = L.filter(
				(entry) =>
					L.some(title => entry.includesTitle('hebrew', title), parashaNames.hebrew)
				 || L.some(title => entry.includesTitle('english', title), parashaNames.english),
				mp3Files)

			if (indexFinder.length !== 1) {
				console.log(parashaNames, indexFinder.length, indexFinder.toJSON());
				writeJson('./wwwErrorParashaData.json', mp3Files.toJSON());
				throw Error("What in the world happened? WAIT, AGAIN? " + indexFinder.length)
			}
		}

		const functionsForPentateuch = parashaRows.map(parashaRow => pentateuchParashaExtractor(parashaRow));
		await Promise.all(functionsForPentateuch);

		console.log('PARASHA PART 3: Parasha Info')
		const infoPageIndex = await URLDom(new URL("https://pizmonim.com/weekly.php"));
		const indParashaPages = await Promise.all(
			Array.from(infoPageIndex.querySelectorAll<HTMLAnchorElement>('ul.collapsemenu > li > ul.acitem > li > a'))
				.filter(anchorElement => hebrewTextFromElement(anchorElement.innerHTML) !== 'משלי')
				.map(Element => new URL(Element.href, 'https://pizmonim.com'))
				.map(async (url) => await URLDom(url))
		);

		for (const parashaPage of indParashaPages) {
			const parashaNames = {
				hebrew: L.list(cleanupText(parashaPage.getElementsByTagName('h1')[0].innerHTML)
					.split(' ')
					.filter(string => hebrewTextFromElement(string) !== '')
					.join(' ')
					.replace('שבת ', '')),
				english: L.list(cleanupText(parashaPage.getElementsByTagName('h1')[0].innerHTML)
					.split(' ')
					.filter(string => hebrewTextFromElement(string) == '')
					.join(' ')
					.replace('Shabbat ', '')
					.replace('-', '')
					.trim())
			}

			const longDescription = {'pizmonim.com': []} as ParashaClass['longDescriptions'];
			const sectionHeaders = Array.from(parashaPage.getElementsByTagName('h2'))
				.filter(headerElement => cleanupText(headerElement.innerHTML).replaceAll('-', '') !== '');

			for (const section of sectionHeaders) {
				let adjacentElement = section.nextElementSibling;
				if (!adjacentElement) {
					if (section.parentElement!.nodeName !== 'FONT') {
						console.log('Text without sibling: ' + cleanupText(section.innerHTML));
						console.log('Page found on: ' + parashaNames.english.toJSON()[0])
						continue;
					}

					adjacentElement = section.parentElement;
				}

				longDescription['pizmonim.com'].push({
					title: cleanupText(section.innerHTML),
					description: cleanupText(adjacentElement!.innerHTML.replaceAll('&nbsp;', ' '))
				});
			}

			mp3Files = mergeArrayOptions(mp3Files, {
				title: parashaNames,
				longDescription
			});
			const mp3FilesIndexer = L.filter(
				(entry) =>
					L.some(title => entry.includesTitle('hebrew', title), parashaNames.hebrew)
				 || L.some(title => entry.includesTitle('english', title), parashaNames.english),
				mp3Files)

			if (mp3FilesIndexer.length !== 1) {
				console.log(parashaNames, mp3FilesIndexer.length, mp3FilesIndexer.toJSON());
				writeJson('./wwwErrorParashaData.json', mp3Files.toJSON());
				throw Error("What in the world happened? WAIT, AGAIN? " + mp3FilesIndexer.length)
			}
		}

		console.log("Parasha Part 4 - LearnTefilah");
		const tefilahDocumentBasis = await URLDom(new URL('https://www.learntefillah.com/parasha/noach/weekdays/'));
		const learnTefilahList = extractLearnTefilahDropdown(tefilahDocumentBasis, "sbxCapitulos");

		// deno-lint-ignore no-inner-declarations
		async function learnTefilahParashaExtractor (LTparashaIndex:string, LTparasha:string[]) {
			const learnTefilahParashaDocument = await URLDom(new URL(LTparashaIndex))
			const learnTefilahAliyaList = extractLearnTefilahDropdown(learnTefilahParashaDocument, "sbxPaginas", false)

			const recordings = {} as Record<string, IndParashaRecording[]>;

			async function learnTefilahAliyaExtractor (learnTefilahAliyaLink:string, learnTefilahAliya:string[]) {
				const aliyaDocument = await URLDom(new URL(learnTefilahAliyaLink))

				const musicEmbeds = aliyaDocument.getElementsByClassName("insdDownload")
				for (const musicEmbed of Array.from(musicEmbeds)) {
					const learnTefilahUploadAuthor = cleanupText(musicEmbed.querySelector<HTMLSpanElement>("span.authorname")!.innerHTML) || "learnTefilah";
					const learnTefilahUploadLink = musicEmbed.querySelector<HTMLAnchorElement>("a.icon-download")?.href!;

					if (!(learnTefilahUploadAuthor in recordings))
						recordings[learnTefilahUploadAuthor] = [];

					recordings[learnTefilahUploadAuthor].push({
						part: Array.from(learnTefilahAliya)[0]
							.replaceAll("Rishon", "ראשון")
							.replaceAll("Sheni", "שני")
							.replaceAll("Shelishi", "שלישי")
							.replaceAll("Revii", "רביעי")
							.replaceAll("Chamishi", "חמישי")
							.replaceAll("Shishi", "ששי")
							.replaceAll("Shevii", "שביעי"),
						url: learnTefilahUploadLink
					})
				}
			}

			const learnTefilahAliyaFunctions = Array.from(Object.entries(learnTefilahAliyaList))
				.map(([link, aliya]) => learnTefilahAliyaExtractor(link, aliya));
			await Promise.all(learnTefilahAliyaFunctions);

			mp3Files = mergeArrayOptions(mp3Files, { title: { english: L.list(...LTparasha), hebrew: L.list() }, recordings });

			const mp3FilesIndexer = L.filter(
				entry => LTparasha.some(engName => entry.includesTitle('english', engName)),
				mp3Files);
			if (mp3FilesIndexer.length !== 1) {
				console.log(LTparasha, mp3FilesIndexer.length, mp3FilesIndexer.toJSON());
				writeJson('./wwwErrorParashaData.json', mp3Files.toJSON());
				throw Error("What in the world happened? WAIT, AGAIN? " + mp3FilesIndexer.length)
			}
		}

		const learnTefilahFunctions = Array.from(Object.entries(learnTefilahList))
			.map(([link, parasha]) => learnTefilahParashaExtractor(link, parasha));
		await Promise.all(learnTefilahFunctions);

		console.log('PARASHA PART 5: ITALIAN')
		const italianText = (await fixEncodeFetch(new URL('http://www.archivio-torah.it/audio/indiciaudio/indiceparashot.htm')))
			.replaceAll('<o:p>&nbsp;</o:p>', '')
			.replaceAll('<o:p></o:p>', '')
		const italianIndex = TextDom(italianText);
		const allHTMLRows = Array.from(italianIndex.getElementsByClassName("WordSection1")[0].children)
			.map(elem => elem.tagName.toUpperCase() != "P"
				|| cleanupText(elem.innerHTML) !== "" ? elem : "sonicthehedgehogisnotastringyouexpecthere")
			.map(elem => (typeof elem == "string" ? elem : elem.outerHTML))
			.join('')
			.split('sonicthehedgehogisnotastringyouexpecthere')
			.map(section => section.trim()).filter(Boolean)

		allHTMLRows.pop();
		allHTMLRows.shift();

		const italianParashaRows = allHTMLRows.map(elemText => {
			const elem = TextDom(elemText).body
			return Array.from(elem.children)
				.map((child, i, row) => {
					if (i + 1 === row.length) {
						return Array.from(child.getElementsByTagName('a')).find(a => a.innerHTML.trim().toLowerCase().includes("audio"))
					} else { 
						return child.textContent?.trim()
					}
				})
				.filter(Boolean);
		})
			.filter(array => {
				const preLastElem = array[array.length - 2];
				return preLastElem
					&& typeof preLastElem == "string"
					&& (preLastElem.startsWith('Genesi')
						|| preLastElem.startsWith('Esodo')
						|| preLastElem.startsWith('Levitico')
						|| preLastElem.startsWith('Numeri')
						|| preLastElem.startsWith('Deuteronomio'))})
			.map((array) => {
				const lastElem = array[array.length - 1];
				if (lastElem)
					// @ts-ignore
					array[array.length - 1] = (lastElem as HTMLAnchorElement).getAttribute('href')

				return array;
			})

		for (const italianParasha of italianParashaRows) {
			const bookSection = {
				"Noah": "6;9",
				"Bear Sinai": "25;1",
				"Vaishlach": "32;4",
				"Tezavvè": "27;20",
				"Beaalotecha": "8;1",
				"Ki Tezè": "21;10",
			}[cleanupText(italianParasha[0] as string)] || cleanupText(italianParasha[italianParasha.length - 2]! as string)
				.split(' ')
				.at(-1)

			let bookTitle = cleanupText(italianParasha[italianParasha.length - 2]! as string)
				.split(' ')[0]
				.replace('Genesi', "בראשית")
				.replace('Esodo', "שמות")
				.replace('Levitico', "ויקרא")
				.replace('Numeri', "במדבר")
				.replace('Deuteronomio', "דברים") as ParashaBooks

			if (["Tazria", "Mezorà"].includes(cleanupText(italianParasha[0] as string)))
				bookTitle = "ויקרא";

			const mp3Section = L.filter(
				mp3Obj => mp3Obj.sourceBook && bookTitle in mp3Obj.sourceBook && mp3Obj.sourceBook[bookTitle].startsWith(bookSection!.replace(';', ':')),
				mp3Files
			)

			if (!mp3Section.length) {
				console.log("Couldn't find Italian Parasha", bookTitle, bookSection, italianParasha[0])
				continue;
			} else if (mp3Section.length > 1) {
				console.log('More than 1 name for Italian Parasha', italianParasha[0], mp3Section.toJSON())
				throw Error("More than 1 name for Italian Parasha")
			}

			const entry = L.toArray(mp3Section)[0];
			console.log(entry.title.english, cleanupText(italianParasha[0] as string), entry.sourceBook, bookTitle, bookSection)
			entry.addEnglishTitle(L.list(cleanupText(italianParasha[0] as string)))
			entry.addRecording({
				author: (italianParasha[italianParasha.length - 3] as string),
				part: "הכל",
				url: new URL(italianParasha[italianParasha.length - 1] as string)
			})
		}

		/* console.log('PARASHA PART 6: Eastern Ashkenaz')
		const easternAshkenazSeferList = [
			'https://www.torahrecordings.com/torah-reading/001_breishis_tk/',
			'https://www.torahrecordings.com/torah-reading/002_shemos_tk/',
			'https://www.torahrecordings.com/torah-reading/003_vayikra_tk/',
			'https://www.torahrecordings.com/torah-reading/004_bamidbar_tk/',
			'https://www.torahrecordings.com/torah-reading/005_devarim_tk/'
		].map(link => new URL(link));

		// deno-lint-ignore no-inner-declarations
		async function loopOverEastAshki(sefer: URL) {
			const seferIndex = await URLDom(sefer);
			const collapsedLinks = Array.from(seferIndex.querySelectorAll('.collapse.list-group.list-group-flush > li > a'))

			async function handleLink(aElem: HTMLAnchorElement) {
				const withSpaceIdentifier = aElem.innerHTML.trim().match(/(?:\d - )?((?:\w|\/)*), (.*) - (.*)/);
				if (withSpaceIdentifier) {
					const bookTitle = withSpaceIdentifier[1]
						.replaceAll('Breishis/Genesis', "בראשית")
						.replaceAll('Shemos/Exodus', "שמות") as ParashaBooks;

					
				}
				const parashaPage = await URLDom(new URL(aElem.href));
				parashaPage.getElementsByTagName("audio")[0].children[0].getAttribute('src');
			}

			const dataLinks = await Promise.all(collapsedLinks.map(link => handleLink(link)))
			
		} */


		console.log('PARASHA PART 6: Makam Table')
		const makamIndex = await URLDom(new URL('https://pizmonim.com/maqamsources.php'));
		const makamBookTable = Array.from(makamIndex.getElementsByTagName('table'))
			.filter(table => table.classList.contains('MaqamTable'))
			.filter(table => ["בראשית", "שמות", "ויקרא", "במדבר", "דברים"].includes(hebrewTextFromElement(table.rows[0].cells[0].innerHTML!)))

		for (const parashaBookMakam of makamBookTable) {
			const makamPerParasha = Array.from(parashaBookMakam.rows)
				.filter(row => !row.querySelector('th'))

			for (const parashaMakam of makamPerParasha) {
				const indexFinderList = L.filter(
					mp3Obj => mp3Obj.includesTitle('english', cleanupText(parashaMakam.cells[0].innerHTML)
						.replace("Va'era", "Vaera")
						.replace("Miqes Hanukkah", "Miqes")
						.replace("Ahare", "Aharei")
						.replace("Behalot.", "Behaalotecha")
						.replace("Ekha", "Devarim")
						.replace("Nahamu", "Vaethanan")
						.replace("Vayelekh (Shuba)", "Vayelekh")
						.replace("Ha'azinu", "HaAzinu")
						// Lowercase for VeZot Haberakhah
					),
					mp3Files
				)

				if (!indexFinderList.length) {
					console.log('No English name entry for Parashath ' + parashaMakam.cells[0].innerHTML)
					continue;
				} else if (indexFinderList.length > 1) {
					console.error('More than 1 name for Parasha Makam Table', parashaMakam.cells[0].innerHTML, indexFinderList.toJSON())
					continue;
					//throw Error("More than 1 name for Parasha Makam Table")
				}

				for (let index = 1; index < parashaMakam.cells.length; index++) {
					L.toArray(indexFinderList)[0].makamTable![cleanupText(parashaBookMakam.rows[0].cells[index].innerHTML)]
						= cleanupText(parashaMakam.cells[index].innerHTML)
				}
			}
		}

		/*
		console.log('PARASHA PART 7: Chabad')
		const cloudscraper = python.import("cloudscraper")
		const scraper = cloudscraper.create_scraper()

		const chabadIndex = TextDom(scraper.get('https://www.chabad.org/multimedia/music_cdo/aid/982057/jewish/Torah-Reading-Recordings.htm').text)
		const chabadRecordings = Object.fromEntries(Array.from(chabadIndex.querySelectorAll<HTMLTableRowElement>('table#BodyWrapper tr.row'))
			.filter(row => row.querySelector<HTMLAnchorElement>('.title a')?.innerHTML.startsWith('Book of'))
			.map(bookRow => bookRow.querySelector<HTMLAnchorElement>('.nested_item.more.bold a'))
			.filter(Boolean)
			.map(anchorElement => new URL(anchorElement!.getAttribute('href')!, 'https://chabad.org'))
			.map(individualChabadBook => {
				const document = TextDom(scraper.get(individualChabadBook.href).text);
				return Array.from(document.querySelectorAll<HTMLAnchorElement>("#BodyWrapper > tbody > tr > td > div > div > div.title > a"))
					.map(anchorElement =>
						[cleanupText(anchorElement.innerHTML), new URL(anchorElement.getAttribute('href')!, 'https://chabad.org/').href] as [string, string]
					)
			})
			.flat())

		for (const [chabadParasha, chabadRecordingPage] of Object.entries(chabadRecordings)) {
			mp3Files = mergeArrayOptions(mp3Files, {english: new Set([chabadParasha])});

			const mp3FilesIndexer = Array.from(mp3Files)
				.filter(entry => entry.title.english.has(chabadParasha))
			if (mp3FilesIndexer.length !== 1) {
				console.log(chabadParasha, chabadRecordingPage, mp3FilesIndexer.length, mp3FilesIndexer);
				writeJson('./wwwErrorParashaData.json', mp3Files);
				throw Error("What in the world happened? WAIT, AGAIN? " + mp3FilesIndexer.length)
			}

			const mp3Obj = mp3FilesIndexer[0]
			mp3Obj.title.english = new Set([...mp3Obj.title.english, ...[chabadParasha]])

			const pageId = chabadRecordingPage.split("/").at(-3)!
			const metaData = await (await fetch("https://www.chabad.org/multimedia/mediaplayer/flash_media_player_content.xml.asp?what=json&aid=" + pageId)).text()
			const mediaId = Array.from(
				metaData
					.split("/n")
					.find(line => line.includes("MediaId"))!
					.trim()
					.matchAll(/".*": "(\d*)"/g)
				)!.at(-1)!.at(-1)!;

			const link = `https://www.chabad.org/multimedia/mediaplayer/flash_media_player_content.xml.aspx?what=load&fileType=mp3&mediaId=${mediaId}&aid=0`;

			if (!("Michoel Slavin" in mp3Obj.recordings!))
				mp3Obj['recordings']!["Michoel Slavin"] = new Set([]);

			mp3Obj.recordings!["Michoel Slavin"].add({ part: "הכל", url: link});
		} */

		writeJson('./wwwParashaData.json', mp3Files.toJSON());
		Deno.exit();

		break;
	} /* case 'tehilim': {
		const tehilimData:Record<number, TehilimPsalm> = {};

		console.log('Accessing Tehilim Root Page')
		const tehilimPageDocument = await URLDom(TehilimPage);
		const perakimTable = tehilimPageDocument.getElementsByClassName('style34')[0];

		const perakimRows:Array<HTMLTableRowElement> = Array.from((perakimTable as HTMLTableElement).rows)
		perakimRows.shift();
		perakimRows.shift();

		console.log('Looping through Tehilim')

		for (const row of perakimRows) {
			if (!row.cells[1].querySelector('a')) continue;

			const pizmonData:TehilimPsalm = {
				firstWords: cleanupText(row!.cells[1]!.firstElementChild!.innerHTML),
				recordings: {"sepharadichazzanutproject.com": new URL(row!.cells[1]!.firstElementChild!.getAttribute('href')!)},
			}

			if (row.cells[2].innerHTML !== '&nbsp;')
				pizmonData.location = cleanupText(row.cells[2].innerHTML)

			tehilimData[parseInt(row.cells[0].innerHTML)] = pizmonData
		}

		writeJson('./tehilimTable.json', consoleLogAndReturn(tehilimData));
		Deno.exit();
		break;
	} case 'tanach': {
		const data:Record<string, Record<string, Array<TanakhObject>>> = {};

		console.log('Getting Main Index Page')
		const indexDocument = await URLDom(rootTanakhIndex);

		const linkElements:Element[] = Array.from(indexDocument.getElementsByClassName('style51')[0].getElementsByTagName('a'))
		const pages:Array<URL> = [...new Set(linkElements
			.map((element) => element.getAttribute('href')!)
			.map(fullLink => new URL(fullLink, 'http://www.sephardichazzanut.com/').href)
			.map(url => {
				const fullArray = url.split('#')
				if (fullArray.length !== 1)
					fullArray[fullArray.length - 1] = '';
				return fullArray.join('#')
			})
			.filter(url => ![TehilimPage, ...parashaData].map(dataLinks => dataLinks.href).includes(url))
		)].map(url => new URL(url));

		for (const website of pages) {
			console.log(`Getting Sub Page: ${website}`)
			const indPageDocument = await URLDom(website);

			const tables = indPageDocument.querySelectorAll<HTMLTableElement>('table.style37, table.style34');
			data[website.href] = {};

			for (const table of Array.from(tables)) {
				const tableTitle:string = cleanupText(table!.rows[0]!.cells[0]!.firstElementChild!.innerHTML);

				const JSONRows:Array<TanakhObject> = [];

				const tableRowList = Array.from(table.rows);
				tableRowList.shift();
				tableRowList.shift();
				console.log(tableRowList);

				for (const rowChild of tableRowList) {
					if (!rowChild.cells[0].querySelector('a')) continue;

					const TanakhData:TanakhObject = {
						link: rowChild!.cells[0]!.firstElementChild!.getAttribute('href')!,
						sections: {
							english: cleanupText(rowChild!.cells[0]!.querySelector('a')!.innerHTML)!,
							hebrew: cleanupText(rowChild!.cells[1]!.querySelector('a')!.innerHTML!)
						}
					}

					if (cleanupText(rowChild.cells[2].innerHTML) !== '')
						TanakhData.description = cleanupText(rowChild.cells[2].innerHTML)

					JSONRows.push(TanakhData)
				}

				data[website.href][tableTitle] = JSONRows;
			}
		}

		writeJson('./haftaraTables.json', consoleLogAndReturn(data))
		Deno.exit();
		break;
	} case 'pizmonim': {
		const _hazzanutIndex = new URL('http://www.sephardichazzanut.com/Hazzanut.htm');
		const _pizmonimIndex = new URL('http://www.sephardichazzanut.com/Pizmonim.htm');

		Deno.exit()
		break;
	} */
	// Pizmonim.com
	case 'yerushalmitehilim': {
		const listOfTehilimRecordings:Record<number, TehilimPsalm> = {};

		const tehilimIndex = await URLDom(new URL('https://pizmonim.com/section.php?maqam=Tehillim'));
		const tehilimRows = Array.from(tehilimIndex.querySelectorAll<HTMLTableRowElement>('.MaqamTable tr'))
			.filter(row => row.cells[2].innerHTML.includes('מזמור'));

		for (const tehilimPizmon of tehilimRows) {
			const pizmonNumber = parseInt(tehilimPizmon.cells[0].innerHTML)

			const descriptionElement = tehilimPizmon.cells[3]
			let child = descriptionElement.lastElementChild; 
			while (child) {
				child.innerHTML = '';
				descriptionElement.removeChild(child);
				child = descriptionElement.lastElementChild;
			}

			listOfTehilimRecordings[pizmonNumber] = {
				firstWords: (tehilimPizmon as HTMLTableRowElement).cells[5].innerHTML || "",
				location: descriptionElement.innerHTML,
				recordings: await pizmonimOrgLinkFetcher(
					(tehilimPizmon as HTMLTableRowElement).cells[4],
					string => string
						.replace('Psalm ' + pizmonNumber, '')
						.split('-')
						.join('')
						.trim()
				)
			};
		}

		console.log(listOfTehilimRecordings)
		writeJson('./yerushalmitehilim.json', listOfTehilimRecordings);
		Deno.exit();
		break;
	} /* case 'parashahaftarah': {
		const Haftarot:Record<string, {
			relation: string;
			source: string;
			recordings: pizmonimOrgLinkFetcherReturn
		}> = {};

		const haftarahIndex = await URLDom(new URL('https://pizmonim.com/section.php?maqam=Haftarot'));
		const tableRows = Array.from(haftarahIndex.querySelectorAll('.MaqamTable tr'))
			.filter(row => (row as HTMLTableRowElement).cells[2].innerHTML.includes('הפטרת'));

		for (const rowHTML of tableRows) {
			Haftarot[cleanupText((rowHTML as HTMLTableRowElement).cells[2].innerHTML).replace('הפטרת', '').trim()] = {
				relation: cleanupText((rowHTML as HTMLTableRowElement).cells[5].innerHTML) || "",
				source: cleanupText((rowHTML as HTMLTableRowElement).cells[3].innerHTML),
				recordings: await pizmonimOrgLinkFetcher((rowHTML as HTMLTableRowElement).cells[4])
			};

			console.log(Haftarot[cleanupText((rowHTML as HTMLTableRowElement).cells[2].innerHTML).replace('הפטרת', '').trim()])
		}

		writeJson('./data/parashaHaftarah.json', consoleLogAndReturn(Haftarot));
		Deno.exit();
		break;
	} case 'mishleh': {
		const mishleh = await URLDom(new URL('https://pizmonim.com/section.php?maqam=Mishle'));
		writeJson('./yerushalmitehilim.json', consoleLogAndReturn(await pizmonimOrgLinkFetcher((mishleh
			.querySelectorAll('.MaqamTable tr')
			[1] as HTMLTableRowElement)
			.cells[4]
		)));
		Deno.exit();
		break;
	}
	// Others
	case 'clearDaf': {
		const massechet = 'chagiga';
		const arrayForFile = [];

		for (let index = 2; index < 28; index++) {
			console.log(index);

			const indexDocument = await URLDom(new URL(`https://www.realcleardaf.com/${massechet}-${index}/`), { headers: {'cookie': clearDafCookies } });
			const audioFile = indexDocument.querySelector('.shiur-audio a')?.getAttribute('href');

			console.log(audioFile)
			arrayForFile.push(audioFile);
		}

		writeJson('./realclearDaf.json', consoleLogAndReturn(arrayForFile));
		Deno.exit();
		break;
	} case 'itorah': {
		const arrayForFile = [];
		const startingIndex = 992 - 2;
		for (let index = 2; index < (112 + 1); index++) {
			console.log(index);
			arrayForFile.push('https://learntorah.com/Gemara/' + (startingIndex + index) + '.mp3');
		}

		writeJson('./iTorah.json', consoleLogAndReturn(arrayForFile));
		Deno.exit();
		break;
	} */ /* case 'torahAnytime': {
		const speakerID = 639;
		const localTatSpeakers = Array.from(Deno.readDirSync(path.join(Deno.cwd(), 'torahAnytime')))
			.filter(DirEntry => DirEntry.isDirectory)
			.map(DirEntry => DirEntry.name)
			.find(directory => directory.startsWith(speakerID.toString()));

		const request = await fetch('https://www.torahanytime.com/n/list', {
			method: 'POST',
			body: new URLSearchParams({
				'l': 'lectures',
				't': 'all',
				'o': '0',
				'f': JSON.stringify({speaker: 639}),
				'limit': '600'
			}),
			headers: new Headers({ */
				// 'accept': 'application/json, text/javascript, */*; q=0.01',
				// 'cookie': '__tawkuuid=e::torahanytime.com::DI2GU/Q5o6AmIDvYo10DOiFDBRSAf9wYnyMfmrdwPNnVEv1P6sS3YmVmgVcCmOiS::2; __stripe_mid=6ee7de88-a062-4859-bc9c-0314a9dcf2c8db162a; TawkConnectionTime=0',
				/* 'origin': 'https://www.torahanytime.com',
				'referer': 'https://www.torahanytime.com'
			})
		});

		const bodyJSON = await request.json();
		const tatPartObject:Record<number, {
			link?: string,
			title: string,
			date: Date
		}> = Object.fromEntries(bodyJSON.items.map((item:any) => [item[0], { title: item[1], date: new Date(item[3]) }]));

		writeJson('./tatPartObj.json', consoleLogAndReturn(tatPartObject));
		Deno.exit();
		break;
	} case 'fullTorahAnytime': {
		const {default: TATImport} = await import('./tatPartObj.json', { assert: { type: 'json' } });
		const tatObject:{link: string, title: string}[] = [];
		let entriesSoFar = 1;
		for (const item of TATImport) {
			let gatewayErrorCount = 0;
			console.log(`Starting on shiur #${item.link} (${entriesSoFar}/${TATImport.length}): ${item.title}`)
			while (true) {
				const newReq = await fetch('https://www.torahanytime.com/n/v', {
					method: 'POST',
					body: new URLSearchParams({
						'v': (item.link).toString(),
						'is_video': 'false'
					})
				});

				const newReqText = await newReq.text();
				if (newReqText.includes('Please try again in a few minutes.')) {
					gatewayErrorCount++;
					console.log(`Failed with Gateway error. Times so far: ${gatewayErrorCount}`);

					if (gatewayErrorCount == 3)
						break;

					const delay = (ms:number) => new Promise(res => setTimeout(res, ms));
					await delay(4000);

					console.log('Finished waiting, onto next loop')

					continue;
				}

				try {
					const newReqJSON = JSON.parse(newReqText);
					tatObject.push({
						link: 'https://www.torahanytime.com/dl/mp3/' + newReqJSON.data.media + '.mp3',
						title: item.title
					})
					entriesSoFar++;
				} catch (e) {
					console.error(e);
					console.error(newReqText);
					Deno.exit();
				}

				console.log(`Finished with ${item.title} shiur`)
				gatewayErrorCount = 0;
				break;
			}
			if (gatewayErrorCount)
				Deno.exit();
		}

		writeJson('./tatObj.json', consoleLogAndReturn(tatObject));
		Deno.exit();
		break;
	} */ default:
		console.log('Faulty Selector')
		Deno.exit()
		break;
}