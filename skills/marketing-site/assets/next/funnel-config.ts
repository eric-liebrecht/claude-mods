// funnel-config.ts (project root, imported as "@/funnel-config"): paste the released draft's funnel-config
// JSON here unchanged. Example: the KANZLEIFLOW draft (fictional).
import type { FunnelConfig } from "./funnel-engine";

export const funnelConfig: FunnelConfig = {
	"name": "Kanzlei-Check",
	"steps": [
		{
			"id": "ziel",
			"short": "Ziel",
			"question": "Was soll Ihre Website vor allem leisten?",
			"type": "single",
			"options": [
				{
					"value": "mandanten",
					"label": "Passende Mandanten",
					"sub": "Anfragen vorsortieren"
				},
				{
					"value": "bewerber",
					"label": "Bewerber",
					"sub": "Fachkräfte gewinnen"
				},
				{
					"value": "beides",
					"label": "Beides",
					"sub": "Mandanten und Bewerber"
				},
				{
					"value": "unklar",
					"label": "Noch unklar",
					"sub": "Das klären wir im Gespräch"
				}
			]
		},
		{
			"id": "groesse",
			"short": "Mitarbeitende",
			"question": "Wie viele Mitarbeitende hat Ihre Kanzlei?",
			"type": "single",
			"options": [
				{
					"value": "1-4",
					"label": "1 bis 4"
				},
				{
					"value": "5-19",
					"label": "5 bis 19"
				},
				{
					"value": "20-50",
					"label": "20 bis 50"
				},
				{
					"value": "50+",
					"label": "über 50"
				}
			]
		},
		{
			"id": "anfragen",
			"short": "Anfragen/Monat",
			"question": "Wie viele Anfragen bekommen Sie pro Monat?",
			"hint": "Eine grobe Schätzung reicht.",
			"type": "single",
			"options": [
				{
					"value": "lt10",
					"label": "unter 10",
					"n": 6
				},
				{
					"value": "10-30",
					"label": "10 bis 30",
					"n": 20
				},
				{
					"value": "30plus",
					"label": "über 30",
					"n": 40
				}
			]
		},
		{
			"id": "heute",
			"short": "Heute",
			"question": "Wie kommen Anfragen heute an?",
			"hint": "Mehrfachauswahl.",
			"type": "multi",
			"min": 1,
			"options": [
				{
					"value": "formular",
					"label": "Kontaktformular"
				},
				{
					"value": "mail",
					"label": "E-Mail"
				},
				{
					"value": "telefon",
					"label": "Telefon"
				},
				{
					"value": "empfehlung",
					"label": "Empfehlung"
				}
			]
		},
		{
			"id": "start",
			"short": "Start",
			"question": "Wann möchten Sie starten?",
			"type": "single",
			"options": [
				{
					"value": "sofort",
					"label": "Schnellstmöglich",
					"sub": "Der Zustand kostet jetzt Zeit"
				},
				{
					"value": "q",
					"label": "In 1 bis 3 Monaten",
					"sub": "Konkret in Planung"
				},
				{
					"value": "info",
					"label": "Erst informieren"
				}
			]
		}
	],
	"result": {
		"title": "Ihre erste Einschätzung",
		"label": "Zeit für Vorgespräche heute, geschätzt",
		"expr": "anfragen * 20 / 60",
		"digits": 0,
		"valueTemplate": "ca. {value} h / Monat",
		"explain": "Gerechnet aus Ihrer Angabe ({anfragen.label} pro Monat) und 20 Minuten Vorgespräch je Anfrage. Kein Angebot, keine Zusage.",
		"notes": [
			{
				"when": {
					"groesse": "1-4"
				},
				"text": "Für Kanzleien Ihrer Größe prüfen wir im Gespräch ehrlich, ob sich ein eigener Check lohnt."
			},
			{
				"when": {
					"ziel": [
						"bewerber",
						"beides"
					]
				},
				"text": "Die Karriereseite planen wir im Entwurf direkt mit."
			}
		],
		"cta": "Weiter zur Kontaktangabe"
	},
	"contact": {
		"title": "Wohin dürfen wir uns melden?",
		"promise": "Wir melden uns innerhalb von zwei Werktagen für ein 30-Minuten-Gespräch.",
		"fields": [
			{
				"name": "name",
				"label": "Name",
				"required": true,
				"autocomplete": "name"
			},
			{
				"name": "company",
				"label": "Kanzlei",
				"required": true,
				"autocomplete": "organization"
			},
			{
				"name": "email",
				"label": "E-Mail",
				"type": "email",
				"required": true,
				"autocomplete": "email"
			},
			{
				"name": "phone",
				"label": "Telefon",
				"type": "tel",
				"autocomplete": "tel"
			},
			{
				"name": "role",
				"label": "Ihre Rolle",
				"type": "select",
				"full": true,
				"options": [
					"Inhaber oder Partner",
					"Kanzleimanagement",
					"Sonstiges"
				]
			},
			{
				"name": "message",
				"label": "Was sollten wir vorab wissen?",
				"type": "textarea",
				"full": true,
				"placeholder": "z. B. Schwerpunkt Heilberufe, 3 offene Stellen"
			}
		],
		"submit": "Anfrage senden",
		"legal": "Wir verarbeiten Ihre Angaben, um Ihre Anfrage zu beantworten. Details in der <a href=\"#/start\">Datenschutzerklärung</a>.",
		"successTitle": "Danke, Ihre Anfrage ist da.",
		"successText": "Wir melden uns innerhalb von zwei Werktagen."
	}
};
