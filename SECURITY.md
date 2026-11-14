# Security policy

This tool reads files that other people write (GLB, glTF, OBJ, PNG and JPEG) and runs entirely in
the browser: nothing you open is uploaded. A bug that lets a crafted file crash it, hang it, or
make it do something it should not is a security problem, and I want to hear about it.

## Reporting a vulnerability

Please report it privately, using GitHub's private vulnerability reporting:

<https://github.com/nokgc333/lint-asset/security/advisories/new>

Please do not open a public issue or pull request for a vulnerability. In the report, include:

- what happens and what you expected;
- the steps to reproduce it, and the crafted file if there is one (it stays private in the
  report);
- the version or commit, and the browser and operating system.

I do not ask for an email address, and none is needed: the report page is the only channel.

## What to expect

This is a free tool maintained by one person, so these are goals and not promises:

- I aim to reply within 7 days to say that I received the report.
- How fast a fix comes depends on how serious the problem is. I will not promise a deadline, and I
  will tell you if I need more time.
- When a fix is released, I publish a GitHub Security Advisory, and I credit you by name if you
  want that.

Please give me a reasonable time to fix a problem before you tell others about it.

## Supported versions

Only the latest version is supported. The tool is below 1.0, so there are no fixes for older
versions: update to the latest one.

## What is in scope

- The code in this repository: the C++ core (the file readers and the checks), its WebAssembly
  build, the web app, and the build and release setup in `.github/`.
- A crafted file that crashes the core, makes it read memory it should not, or makes it run for a
  very long time or use a very large amount of memory within the documented size limits.
- Script injection through text from a file, such as a file name.
- A way to make the page send data to another address, or to open an address that is written in a
  file.

## What is out of scope

- A problem in a third-party package that is not caused by how this project uses it: please report
  it to that project. If it affects this project, tell me too.
- A report that needs control of the reporter's own browser, device or account.
- A limit that is documented: very large files are refused or ask for confirmation on purpose.

## Fuzzing

The file readers are fuzzed with libFuzzer on every pull request and every week. A crashing input
is not printed or uploaded by that automation, because until it is fixed it would be a way to
attack the tool.
