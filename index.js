const { PORT, MongoDB_URL } = require('./config.js')
const axios = require('axios')
const axiosRetry = require('axios-retry') // version is 3.8.1, version 4.0.0 has a problem
const cheerio = require('cheerio')
const { MongoClient } = require('mongodb')
const express = require('express')
const app = express()
const cors = require('cors')

app.use(cors())

axiosRetry(axios, {
    retries: 3, // number of retries
    retryDelay: (retryCount) => {
        console.log(`retry attempt: ${retryCount}`);
        return retryCount * 10000; // time interval between retries
    },
    retryCondition: (error) => {
        // if retry condition is not specified, by default idempotent requests are retried
        return error.response.status === 503;
    },
});

const baseUrl = 'https://mzamin.com/news.php?news='
let startNumber = 1
let additionalNumber = 0
const retry_delay = 1800000

app.get('/', function (req, res) {
    res.json('This is my webscraper')
})

async function scrapeAndInsert() {
    try {
        const client = new MongoClient(MongoDB_URL)
        await client.connect()

        const database = client.db('bangla-text-database')
        const collection = database.collection('bangla-news-collection')

        let news = []

        while (true) {
            const url = `${baseUrl}${startNumber}`
            const response = await axios(url)
            const html = response.data
            const $ = cheerio.load(html)

            let title = $('.container article .lh-base.fs-1', html).text()
            let publishedDate = $('.container header .row.d-flex.justify-content-center.py-3 p.text-center', html).text()
            news = $('.container article .row.gx-5.mt-5 .col-sm-8 .col-sm-10.offset-sm-1.fs-5.lh-base.mt-4.mb-5 p', html)
                .map(function () {
                    return $(this).text()
                })
                .get();

            if (news.length === 0) {
                console.log(`news no. ${startNumber} not found at ${new Date()}.`);
                if (additionalNumber < 100) {
                    additionalNumber++
                    startNumber++
                    console.log('aditional number counted')
                } else {
                    additionalNumber = 0
                    await new Promise(resolve => setInterval(resolve, retry_delay))
                    console.log(`news no. ${startNumber} not found at ${new Date()}. waiting for ${retryDelay / 1000} seconds...`);
                }
            } else {
                const resultDocument = {
                    url,
                    title,
                    publishedDate,
                    news,
                }

                collection.insertOne(resultDocument)

                console.log(`news no. ${startNumber} scrapped at ${new Date()}`)

                startNumber++
            }
        }

        await client.close()

        console.log(`Scraping complete at ${new Date()}`);
    } catch (err) {
        console.error(err)
    }
}

scrapeAndInsert()

app.get('/results', (req, res) => {

    res.json({ message: 'Scraping in progress. Check console logs for updates.' })
})

app.listen(PORT, () => { console.log(`server running on PORT ${PORT}`) })