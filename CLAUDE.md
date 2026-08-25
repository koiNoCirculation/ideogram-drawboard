@AGENTS.md
@DESIGN.md
Line count of each ts/tsx file should be less than 400, import and styles doesn't count. If line count of code in single file exceed this limit, please split it into multiple files.
Every commit message should use format: 
```
This commit mainly includes:
1. xxx
2. xxx
3. xxx
```
The commit message should use less than 120 words.

Coding procedure:
1. analyze requirement and existing code
2. make a robust and efficient design
3. create some test cases according to requirement
4. write the code
5. write unit and e2e tests (you can choose writing ut or e2e, depends on requirement or give both of them, for e2e tests, store all scripts under ./e2e_scripts, and write all intermediate e2e files to ./temp)
6. run current tests
7. run all test cases for regression
8. save prompt/requirement to 'historical_prompt/' as md file.
9. generate commit message.

Requirement structure:
```
---Start of comprehensive description---
blahblahblah
---Start of test cases---
when some condition, it should do .....
---Start of test logic---
e.g: you should go to xxx page, click button, wait for request, and see xxx, blah...
```