#!/usr/bin/env node
const path = require('path')
const commandLineArgs = require('command-line-args')
const EventEmitter = require('events').EventEmitter
const ViewBase = require('test-runner/dist/lib/view-base.js')

class RunnerRunner extends EventEmitter {
  constructor (options) {
    super()
    options = options || {}
    this.runners = []
    this.view = new (options.view(ViewBase))()
  }

  set view (view) {
    if (view) {
      if (this._view) {
        this._view.detach()
      }
      this._view = view
      this._view.attach(this)
    } else {
      if (this._view) {
        this._view.detach()
      }
      this._view = null
    }
  }

  get view () {
    return this._view
  }

  runner (runner) {
    if (!runner) return
    runner.manualStart = true
    runner.view = null
    this.runners.push(runner)
  }

  start () {
    if (this.runners.some(r => r.tests && r.tests.some(t => t.only))) {
      for (const runner of this.runners) {
        for (const test of runner.tests) {
          if (!test.only) test.skip = true
        }
      }
    }

    const testCount = this.runners.reduce((total, r) => total + r.tests.length, 0)
    this.emit('start', testCount)
    return Promise
      .all(this.runners.map(runner => {
        runner.on('test-pass', (test, result) => this.emit('test-pass', test, result))
        runner.on('test-fail', (test, err) => this.emit('test-fail', test, err))
        return runner.start()
      }))
      .then(() => {
        this.emit('end')
      })
  }
}

const options = commandLineArgs([
  { name: 'files', type: String, multiple: true, defaultOption: true },
  { name: 'help', type: Boolean, alias: 'h' }
])

if (options.help) {
  const commandLineUsage = require('command-line-usage')
  console.log(commandLineUsage([
    {
      header: 'test-runner',
      content: 'Minimal test runner.'
    },
    {
      header: 'Options',
      optionList: exports.definitions
    }
  ]))
} else {
  if (options.files && options.files.length) {
    const FileSet = require('file-set')
    const path = require('path')
    const flatten = require('reduce-flatten')
    const files = options.files
      .map(glob => {
        const fileSet = new FileSet(glob)
        return fileSet.files
      })
      .reduce(flatten, [])
    if (files.length) {
      const TAPView = require('./view-tap')
      const runnerRunner = new RunnerRunner({ view: TAPView })
      for (const file of files) {
        const runner = require(path.resolve(process.cwd(), file))
        if (runner && runner.tests && runner.tests.length) {
          runnerRunner.runner(runner)
        } else {
          console.log('No runner exported: ' + file)
        }
      }
      runnerRunner.start()
    } else {
      console.log('NO FILES')
    }
  }
}
