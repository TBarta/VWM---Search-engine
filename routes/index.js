var express = require('express');
const fs = require('fs-extra')
const Crawler = require('crawler')
var elasticlunr = require('elasticlunr');
var router = express.Router();

const linkfile = 'linkfile.txt'
const pagerankfile = 'pagerankfile.txt'

class Node {
  constructor(weight, outbound) {
    this.weight = weight
    this.outbound = outbound
  }
}

class Graph {
  constructor() {
    this.edges = {}
    this.nodes = {}
  }

  link(source, target, weight) {
    if (!this.nodes.hasOwnProperty(source)) this.nodes[source] = new Node(0, 0)

    this.nodes[source].outbound += weight

    if (!this.nodes.hasOwnProperty(target)) this.nodes[target] = new Node(0, 0)

    if (!this.edges.hasOwnProperty(source)) this.edges[source] = {}

    if (this.edges[source].hasOwnProperty(target))
      this.edges[source][target] += weight
    else this.edges[source][target] = weight
  }

  pagerank(alpha, epsilon) {
    fs.writeFile(pagerankfile, '', () => {})
    let delta = 1.0
    let inverse = 1 / Object.keys(this.nodes).length

    for (let source of Object.keys(this.edges))
      if (this.nodes[source].outbound > 0)
        for (let target of Object.keys(this.edges[source]))
          this.edges[source][target] /= this.nodes[source].outbound

    for (let key of Object.keys(this.nodes)) this.nodes[key].weight = inverse

    while (delta > epsilon) {
      let leak = 0.0
      let nodes = {}
      for (let [key, value] of Object.entries(this.nodes)) {
        nodes[key] = value.weight

        if (value.outbound == 0) leak += value.weight

        this.nodes[key].weight = 0
      }

      leak *= alpha

      for (let source of Object.keys(this.nodes)) {
        for (let [target, weight] of Object.entries(this.edges[source])) {
          this.nodes[target].weight += alpha * nodes[source] * weight
        }
        this.nodes[source].weight += (1 - alpha) * inverse + leak * inverse
      }

      delta = 0

      for (let [key, value] of Object.entries(this.nodes)) {
        delta += Math.abs(value.weight - nodes[key])
      }
    }

    // sort nodes by weight
    const sortedNodes = Object.entries(this.nodes).sort(
      (a, b) => b[1].weight - a[1].weight
    ).map(([key, value]) => [key, Math.round(value.weight * 1000) / 1000])

    for (let [key, value] of sortedNodes) {
      // let rounded = Math.round(value.weight * 1000) / 1000
      fs.appendFileSync(pagerankfile, `${key}\t${value}\n`, () => {})
    }

    return sortedNodes
  }

  crawl(domain) {
    fs.emptyDir('./html', () => {})
    fs.writeFile(linkfile, '', () => {})
    const outlinks = new Set()
    const pairs = new Set()
    const c = new Crawler({
      maxConnections: 1000,
      callback: (err, res, done) => {
        if (err) console.log(err)
        else {
          const $ = res.$
          const outlink = decodeURI(res.options.uri)

          fs.writeFile(`./html/${outlink.slice(outlink.lastIndexOf('/'), outlink.length)}.html`, $('*'), () => {})

          const inlinks = [
            ...new Set(
              Array.from($('#bodyContent a[href]')).map(
                (link) => link.attribs.href
              )
            ),
          ]
            .filter((link) => {
              return (
                link.startsWith('/index.php/') &&
                link.includes(domain.slice(6)) &&
                !link.includes('Wikipedia') &&
                !link.includes('actor') &&
                !link.includes('Calculations') &&
                !link.includes('TV') &&
                !link.includes('Category') &&
                !link.includes('File') &&
                !link.includes('Template') &&
                !link.includes('User') &&
                !link.includes('Portal') &&
                !link.includes('ISBN') &&
                !link.includes('Talk') &&
                !link.includes('Kingsguard') &&
                !link.includes('Special')
              )
            })
            .map(
              (link) => `https://awoiaf.westeros.org${decodeURIComponent(link)}`
            )
          for (let inlink of inlinks) {
            const pair = `${outlink} ${inlink}\n`
            if (!pairs.has(pair)) {
              fs.appendFile(linkfile, pair, () => {})
              this.link(outlink, inlink, 1.0)
              // console.log(this)
            }
            if (!outlinks.has(inlink)) c.queue(inlink)
            /**
             * toto odkomentuj ak nebudes chciet zaznamenavat pripad,
             * ak je na tej istej stranke viackrat link na tu istu stranku
             */
            pairs.add(pair)
          }
          outlinks.add(outlink)
          done()
        }
      },
    })
    c.queue(`https://awoiaf.westeros.org/index.php/${domain}`)
  }
  search(query) {

    const houses = fs.readFileSync('pagerankfile.txt').toString().split("\n").slice(0,-1)

    var searcher = elasticlunr(function () {
      this.addField('title');
      this.addField('body');
      this.setRef('link');
    });

    houses.forEach((house, index) => {
      let url = house.toString().slice(house.lastIndexOf('/') + 1,-5).replace(/\s/g,'');
      let contents = fs.readFileSync(`./html/${url}.html`);

      searcher.addDoc({
        "link": house.toString().slice(0,-5),
        "title": url,
        "body": contents
      });
    })

    const results = searcher.search(query)
    return results;

  }
}

/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('index');
});

/* GET result of query */
router.get('/result', function(req, res, next) {
  res.send("hello")
});

/* POST request to crawl */
router.post('/crawl', function (req, res, next) {
  const house = req.body.house
  let graph = new Graph()
  graph.crawl(`House_${house}`)
  let nodes;
  setTimeout(() => nodes = graph.pagerank(0.85, 0.00001), 30000)
  setTimeout(() => res.render('pagerank', { house, nodes}), 31000)
})

// ODKOMENTOVAT PRO STARY PAGERANK + RESULT.EJS

/* POST request to search html files for search query */
// router.post('/search', function (req, res, next) {
//   const query = req.body.search
//   let graph = new Graph()
//   let results
//   results = graph.search(query)
//
//   res.render("result",{results,query})
// })


router.get('/search_test/:query', function (req, res, next) {

  console.log(req.params)
  const query = req.params.query
  let graph = new Graph()
  let results
  results = graph.search(query)
  res.json(results)
})

module.exports = router;
