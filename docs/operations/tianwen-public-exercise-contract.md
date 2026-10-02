# Public exercise pilot — frozen original task contracts

These are controlled public exercises, not owner tasks or natural project backlog. Expected cases come only from the pinned Exercism canonical-data.json files, not a candidate or controller-written reference implementation. No predicted success/failure is part of the task. Source commit and license are preserved in the pilot run. The common JSON transport below is explicitly adapted from exercise inputs, rather than claimed to be an upstream CLI.

## Shared transport and original required condition

Implement the declared exercise semantics for every valid input in its original scope. Read one UTF-8 JSON object from stdin, write exactly one JSON value to stdout, exit0, stderr empty. JSON object key order is irrelevant; arrays, characters and spaces are exact. Only Python standard library. Target source <=20,480 UTF-8 bytes. Do not execute programs, access other files, network or delete. Only read this contract and own target; write/edit own target. Cases use valid inputs in the declared exercise scope; do not invent a new invalid-input protocol.

**Common required condition:** Implement the complete declared exercise semantics through the specified JSON stdin/stdout transport, with exit0 and empty stderr for valid original-scope inputs.

## A: word-count

Target scripts/public-exercise-word-count.py. Input: `{"sentence":"ASCII subtitle text"}`. Output a mapping of lowercase word to integer count. Case insensitive; numbers count as words. Whitespace and punctuation separate words, except apostrophes within contractions, which remain in the word. Apostrophes used as quotation marks around a word do not become part of that word. Substrings are separate words; whitespace/separators never produce empty words. Output order is irrelevant. Examples: `"can, can't, 'can't'"` counts `can`1 and `can't`2; `"one,two,three"` counts three words once each. Original source: https://github.com/exercism/problem-specifications/tree/9943fd751b684ba1a6a8673c3700a6e79c10a808/exercises/word-count

## B: transpose

Target scripts/public-exercise-transpose.py. Input `{"lines":["row",...]}`; output array of transposed rows. Rows become columns. Missing characters before a later existing character become spaces. Never add padding after the final existing character of an output row. Preserve all actual characters, including original spaces at the ends of input rows; an original space is not a missing character. Empty input yields an empty array. For `["ABC","DE"]` return `["AD","BE","C"]`; for `["AB","DEF"]` return `["AD","BE"," F"]`. Original source: https://github.com/exercism/problem-specifications/tree/9943fd751b684ba1a6a8673c3700a6e79c10a808/exercises/transpose

## C: grep

Target scripts/public-exercise-grep.py. Input `{"pattern":"fixed string","flags":[...],"files":[{"name":"filename","lines":["line",...]}...]}`. This is an in-memory transport of the named input files, with their original ordered line contents. Output an array of strings, the canonical representation used by Exercism before joining lines for display. Match fixed strings, not regular expressions. Search files and lines in the supplied order. With multiple input files, prefix matching output lines with filename and colon. Flags combine: `-n` prefixes one-based line number and colon after filename if any; `-l` returns each matching filename once, and takes precedence over line-number/line-content formatting; `-i` compares case insensitively; `-v` selects lines that do not match; `-x` requires the entire line to match the pattern. No match returns an empty array. Original source: https://github.com/exercism/problem-specifications/tree/9943fd751b684ba1a6a8673c3700a6e79c10a808/exercises/grep

## Frozen research-only reserves (no extra ordinary source attempts)

D: scripts/public-exercise-bob.py. Input `{"hey":"speech"}`; output one reply string. Whitespace-only is silence: `"Fine. Be that way!"`. Uppercase speech containing letters is yelling; digits/punctuation alone are not yelling. Yelled question: `"Calm down, I know what I'm doing!"`; other yelling: `"Whoa, chill out!"`; a question ends in `?` after trailing whitespace: `"Sure."`; otherwise `"Whatever."`. Source bob canonical cases/requirements.

E: scripts/public-exercise-matching-brackets.py. Input `{"value":"text"}`; output boolean. Match/nest brackets `[]`, braces `{}` and parentheses `()` correctly; ignore all other characters. Empty and non-bracket text are balanced. Source matching-brackets canonical cases/requirements.

The reserves may be supplied only as independent generated study tasks after the original three tasks genuinely meet existing source/counterexample rules. They are never substituted to obtain a desired ordinary outcome. This group is not evidence for subjective writing tone or unrestricted natural-language semantic safety.

## Upstream license

The MIT License (MIT)

Copyright (c) 2014, 2019, 2021 Exercism

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

