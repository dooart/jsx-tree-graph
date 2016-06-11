var _ = require('lodash')
var fs = require('fs')
var exec = require('child_process').exec
var graphviz = require('graphviz')

module.exports = function(components, output) {
  checkGraphvizInstalled()

  var opts = createGraphvizOptions()
  var g = graphviz.digraph('G')

  var nodes = {}
  _.forEach(components, function(c) {
    var node = g.addNode(c.component)
    nodes[c.component] = node
    if (c.hoc) {
      node.set('color', '#995555')
    }
  })

  _.forEach(components, function(c) {
    _.forEach(c.uses, function(dep) {
      if (dep) {
        var edge = g.addEdge(nodes[c.component], nodes[dep.component])
        if (c.hoc) {
          edge.set('color', '#995555')
        }
      } else {
        console.log('error: ', dep, c.component)
      }
    })
  })

  g.output(createGraphvizOptions(), function(data) {
    fs.writeFile(output, data, function (err) {
      if (err) throw err
    })
  })
}

function checkGraphvizInstalled() {
  exec('gvpr -V', function (error, stdout, stderr) {
    if (error !== null) {
      throw new Error('Graphviz could not be found. Ensure that "gvpr" is in your $PATH.\n' + error);
    }
  })
}

function createGraphvizOptions(opts) {
  opts = opts || {}
  var G = {
    layout: opts.layout || 'dot',
    overlap: false,
    bgcolor: '#ffffff'
  }
  var N = {
    fontname: 'Helvetica',
    fontsize: 8,
    color: '#333',
    fontcolor: '#333',
    shape: 'box'
  }
  var E = {
    color: '#555599',
    weight: 1
  }

  return {
    'type': 'png',
    'G': G,
    'E': E,
    'N': N
  }
}
