# persian-writing

Makes Claude write correct Persian. It adds a short section to Claude's system prompt asking for the half-space
(ZWNJ) in words such as `می‌خواهم` and `کتاب‌ها`, Persian `ی` and `ک` instead of Arabic `ي` and `ك`, and Persian
punctuation. Persian digits and `«»` quotes are optional. Nothing changes when Claude writes another language or
code. Use `/persian` to see the options and `/persian digits on` (or `zwnj`, `yeh`, `quotes`, `off`) to change them.

Part of [claude-persian-kit](../../README.en.md) ([فارسی](../../README.md)). MIT.

Install:

```
/plugin install persian-writing --marketplace hosseinhabibi2004/claude-persian-kit
```
