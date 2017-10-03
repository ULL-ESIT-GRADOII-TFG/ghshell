# ghshell [![Build Status](https://travis-ci.org/ULL-ESIT-GRADOII-TFG/ghshell.svg?branch=master)](https://travis-ci.org/ULL-ESIT-GRADOII-TFG/ghshell)

> CLI tool for automatic clone and corrections of GitHub's repositories


## Requirements

Node version >= 8.0.0


## Install

```
$ npm install -g ghshell
```

## Dependencies

To use Gitbook creation function, it's necessary the following dependencies:

* [Gitbook](https://www.gitbook.com) package: 

```
$ npm install -g gitbook-cli
``` 

For more information, visit the [official documentation](https://github.com/GitbookIO/gitbook/blob/master/docs/setup.md).


* [Calibre application](https://calibre-ebook.com/download):

```
$ sudo aptitude install calibre
```

In some GNU/Linux distributions node is installed as nodejs, you need to manually create a symlink:

```
$ sudo ln -s /usr/bin/nodejs /usr/bin/node
```

## Usage

```
$ ghshell
```

List all available commands using command ``help`` inside the application:

```
> help
```

## See Also


* [The Master Degree Thesis (14th of July 2017, Spanish)](https://github.com/ULL-ESIT-GRADOII-TFG/ghshell/blob/master/docs/memoria-ghshell.pdf)


***

_This NPM package was created as Master's Degree Final Project at [University of La Laguna](https://www.ull.es/), Tenerife. Spain._
