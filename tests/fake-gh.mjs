// A stand-in for the GitHub CLI in tests: logs its arguments to $FAKE_GH_LOG and answers with the first rule of
// $FAKE_GH_RULES whose `match` (a RegExp) matches the arguments joined by spaces. No rule: exit 1.
import { appendFileSync, readFileSync } from "node:fs";

const args = process.argv.slice(2);
if (process.env.FAKE_GH_LOG) appendFileSync(process.env.FAKE_GH_LOG, `${JSON.stringify(args)}\n`);
const rules = JSON.parse(readFileSync(process.env.FAKE_GH_RULES, "utf8"));
const joined = args.join(" ");
const rule = rules.find((candidate) => new RegExp(candidate.match).test(joined));
if (!rule) {
	process.stderr.write(`fake gh: no rule for: ${joined}\n`);
	process.exit(1);
}
process.stdout.write(rule.stdout);
process.stderr.write(rule.stderr ?? "");
process.exit(rule.code ?? 0);
