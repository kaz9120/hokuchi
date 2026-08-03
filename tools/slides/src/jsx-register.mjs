// jsx-register.mjs — registers the .jsx load hook (ADR-0018).
// Used as `node --import ./src/jsx-register.mjs <entry>` and from cli.mjs.
import { register } from 'node:module';
register('./jsx-hooks.mjs', import.meta.url);
