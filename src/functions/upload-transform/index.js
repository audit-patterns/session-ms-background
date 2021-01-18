require('dotenv').config()

const XLSX = require('xlsx')

const Stream = require('stream')
const Papa = require('papaparse')
const { Storage } = require('@google-cloud/storage')

const { updateFilepathCSV } = require('./data-access')

const regexIsCell = /^[A-Z]{1,2}\d{1,6}$/g
const regexIsFirstRowCell = /^[A-Z]{1,2}1$/g

const openExcel = async (bucket, session, bufferedData) => {
  console.info('Invoked openExcel')
  const wb = XLSX.read(bufferedData, { type: 'buffer' })
  const sheet = Object.values(wb.Sheets)[0]
  const allrefs = Object.keys(sheet)
  // Extract column headers and persist in Firestore
  const headerrefs = allrefs.filter(item => item.match(regexIsFirstRowCell))
  const headersMap = headerrefs.reduce((acc, cur) => ({
    ...acc,
    [cur.replace(/\d/, '')]: sheet[cur].v,
  }), {})
  // Rebuild file, piping to streamWriter
  const storage = new Storage()
  const storageBucket = storage.bucket(bucket)
  const newFilepath = `all-csvs/${session}.csv`
  updateFilepathCSV(session, newFilepath)

  const passThrough = new Stream.PassThrough()
  await new Promise((resolve, reject) => {
    passThrough
      .pipe(storageBucket.file(newFilepath).createWriteStream())
      .on('error', err => reject(err))
      .on('finish', () => resolve())
    allrefs.reduce((acc, cur, idx) => {
      const isCell = cur.match(regexIsCell)
      const [payload, lastRow] = acc
      if (!isCell && !lastRow) return acc
      const currRow = Number(cur.replace(/[A-Z]{1,2}/, ''))
      const currCol = cur.replace(/\d{1,6}/, '')
      if (lastRow && lastRow > 1 && (currRow !== lastRow || !isCell)) {
        const csv = Papa.unparse([payload], { header: lastRow === 2 })
        passThrough.write(`${csv}\r\n`)
      }
      if (currRow === 1) return [payload, currRow]
      const updatedPayload = {
        ...(currRow === lastRow ? payload : {}),
        [headersMap[currCol]]: sheet[cur].v,
      }
      if (idx === allrefs.length - 1) passThrough.end()
      return [updatedPayload, currRow]
    }, [{}, null])
  })
}

const handler = async (file, context) => {
  console.info(`eventType=${context.eventType} | eventId=${context.eventId}`)
  console.info(JSON.stringify(file))
  const {
    bucket,
    name: filepath,
  } = file
  const filename = filepath.split('/').pop()
  const session = filename.split('.')
  const xtsn = session.pop()
  if (filepath.indexOf('uploads/') === -1 || !['csv', 'xls', 'xlsx'].includes(xtsn)) return

  const storage = new Storage()
  const storageBucket = storage.bucket(bucket)
  const stream = storageBucket.file(filepath).createReadStream()

  console.info('Buffering data...')
  if (xtsn === 'csv') {
    await new Promise((resolve, reject) => {
      const newFilepath = `all-csvs/${session[0]}.csv`
      const writer = storageBucket.file(newFilepath).createWriteStream()
      updateFilepathCSV(session[0], newFilepath)
      stream
        .pipe(writer)
        .on('error', err => reject(err))
        .on('end', () => resolve())
    })
    return null
  }

  let buff = Buffer.from('')
  await new Promise((resolve, reject) => {
    stream
      .on('data', (data) => { buff = Buffer.concat([buff, data]) })
      .on('error', err => reject(err))
      .on('end', async () => {
        await openExcel(bucket, session[0], buff)
        resolve()
      })
  })
}

module.exports = { handler }
