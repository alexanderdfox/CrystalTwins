/* Resolve official/public-domain URLs for Foundation House rooms. */
'use strict';

const CORNELL_CONST = 'https://www.law.cornell.edu/constitution';
const USC_HOUSE_BROWSE = 'https://uscode.house.gov/browse/prelim@title';
const CORNELL_USC = 'https://www.law.cornell.edu/uscode/text';
const ECFR = 'https://www.ecfr.gov';
const CONGRESS = 'https://www.congress.gov';
const ARCHIVES_CONST = 'https://www.archives.gov/founding-docs/constitution-transcript';

/** @typedef {{ id: string, cite: string, name?: string }} RoomLike */

const ROOM_URLS = {
	constitution: ARCHIVES_CONST,
	art1: `${CORNELL_CONST}/articlei`,
	art2: `${CORNELL_CONST}/articleii`,
	art3: `${CORNELL_CONST}/articleiii`,
	art4: `${CORNELL_CONST}/articleiv`,
	art6: `${CORNELL_CONST}/articlevi`,
	amendments: `${CORNELL_CONST}/billofrights`,
	amend4: `${CORNELL_CONST}/amendmentiv`,
	amend5due: `${CORNELL_CONST}/amendmentv`,
	amend14: `${CORNELL_CONST}/amendmentxiv`,
	commerce: `${CORNELL_CONST}/articlei#section-8`,
	necessary: `${CORNELL_CONST}/articlei#section-18`,
	taxing: `${CORNELL_CONST}/articlei#section-1`,
	spending: `${CORNELL_CONST}/articlei#section-1`,
	war: `${CORNELL_CONST}/articlei#section-8`,
	appoint: `${CORNELL_CONST}/articleii#section-2`,
	ipclause: `${CORNELL_CONST}/articlei#section-8`,
	bankruptcy: `${CORNELL_CONST}/articlei#section-4`,
	uscode: 'https://uscode.house.gov/browse/prelim',
	cfr: ECFR,
	apa: `${CORNELL_USC}/5/551`,
	patriot: `${CONGRESS}/107/plaws/56`,
	aumf2001: `${CONGRESS}/107/plaws/40`,
	ftcmerger: 'https://www.ftc.gov/legal-library/browse/merger-guidelines',
	wotus2023: `${ECFR}/current/title-33/chapter-I/subchapter-D`,
	fccrife: 'https://www.fcc.gov/broadband-policy',
	oshaets: `${ECFR}/current/title-29/subtitle-B/chapter-XVII`,
	secsrules: 'https://www.sec.gov/rules-regulations',
	deasched: 'https://www.dea.gov/drug-information/csa',
	fisa702: `${CORNELL_USC}/50/1881a`,
	section230: `${CORNELL_USC}/47/230`,
};

function uscTitleUrl(titleNum) {
	return `${USC_HOUSE_BROWSE}${titleNum}&edition=prelim`;
}

function uscSectionUrl(title, section) {
	const sec = String(section).replace(/\./g, '');
	return `${CORNELL_USC}/${title}/${sec}`;
}

/**
 * @param {RoomLike} room
 * @returns {string|null}
 */
function lawUrl(room) {
	if (!room) return null;
	if (room.url) return room.url;
	if (ROOM_URLS[room.id]) return ROOM_URLS[room.id];

	const id = room.id;
	const cite = room.cite || '';

	if (/^usc\d+$/.test(id)) {
		const t = id.slice(3);
		return uscTitleUrl(t);
	}

	const uscSec = cite.match(/(\d+)\s+U\.S\.C\.?\s*§+\s*(\d+[\w\-]*)/i);
	if (uscSec) return uscSectionUrl(uscSec[1], uscSec[2]);

	const uscTitle = cite.match(/(\d+)\s+U\.S\.C\./i);
	if (uscTitle) return uscTitleUrl(uscTitle[1]);

	const constArt = cite.match(/U\.S\.?\s*Const\.?\s*art\.?\s*([IVXLC\d]+)/i);
	if (constArt) {
		const roman = constArt[1].toUpperCase();
		const map = { I: 'i', II: 'ii', III: 'iii', IV: 'iv', V: 'v', VI: 'vi', VII: 'vii' };
		const slug = map[roman] || roman.toLowerCase();
		return `${CORNELL_CONST}/article${slug}`;
	}

	const amend = cite.match(/(?:amend(?:ment)?\.?|amends?\.?)\s*([IVXLC\d]+)/i)
		|| id.match(/^amend(\d+)/);
	if (amend) {
		const n = amend[1];
		const words = ['', 'i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x', 'xi', 'xii', 'xiii', 'xiv', 'xv', 'xvi', 'xvii', 'xviii', 'xix', 'xx'];
		const num = /^\d+$/.test(n) ? parseInt(n, 10) : null;
		if (num != null && num > 0 && num < words.length) {
			return `${CORNELL_CONST}/amendment${words[num]}`;
		}
	}

	const pubL = cite.match(/Pub\.?\s*L\.?\s*No?\.?\s*(\d+)[-\s](\d+)/i)
		|| cite.match(/Pub\.?\s*L\.?\s*(\d+)-(\d+)/i);
	if (pubL) {
		const congress = pubL[1];
		const law = pubL[2];
		return `${CONGRESS}/${congress}/plaws/${law}`;
	}

	const eo = cite.match(/EO\s*(\d+)/i) || cite.match(/Executive\s+Order\s*(\d+)/i)
		|| id.match(/^eo(\d+)/i);
	if (eo) {
		return `https://www.federalregister.gov/presidential-document/executive-order/${eo[1]}`;
	}

	if (/C\.F\.R\.|Fed\.?\s*Reg\./i.test(cite)) {
		const cfrPart = cite.match(/(\d+)\s+C\.F\.R\.?\s*(?:Part\s*)?(\d+)/i);
		if (cfrPart) {
			return `${ECFR}/current/title-${cfrPart[1]}/part-${cfrPart[2]}`;
		}
		return ECFR;
	}

	if (/U\.S\.?\s*Const/i.test(cite)) return CORNELL_CONST;

	if (/§|U\.S\.C|statute|Act/i.test(cite) && uscTitle) {
		return uscTitleUrl(uscTitle[1]);
	}

	return null;
}

function escapeHtml(s) {
	return String(s)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

/**
 * @param {string} text
 * @param {string|null} url
 * @returns {string}
 */
function citeLinkHtml(text, url) {
	const safe = escapeHtml(text);
	if (!url) return safe;
	const href = escapeHtml(url);
	return `<a href="${href}" target="_blank" rel="noopener noreferrer">${safe}</a>`;
}

/**
 * @param {HTMLElement} el
 * @param {string} text
 * @param {string|null} url
 */
function setLinkedText(el, text, url) {
	if (!url) {
		el.textContent = text;
		return;
	}
	el.innerHTML = citeLinkHtml(text, url);
}
