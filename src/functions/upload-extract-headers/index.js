require('dotenv').config()

const XLSX = require('xlsx')

const { Storage } = require('@google-cloud/storage')

const { updateOriginalColumnHeaders } = require('./data-access')

const regexIsFirstRowCell = /^[A-Z]{1,2}1$/g

const openExcel = async (session, filepath, bufferedData) => {
  console.info('Invoked openExcel')
  const wb = XLSX.read(bufferedData, { type: 'buffer' })
  const sheet = Object.values(wb.Sheets)[0]
  const allrefs = Object.keys(sheet)
  // Extract column headers and persist in Firestore
  const headerrefs = allrefs.filter(item => item.match(regexIsFirstRowCell))
  const columnHeaders = headerrefs.map(item => sheet[item].v)
  await updateOriginalColumnHeaders(session, filepath, columnHeaders)
  return null
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
  let buff = Buffer.from('')
  await new Promise((resolve, reject) => {
    stream.on('data', (data) => { buff = Buffer.concat([buff, data]) })
    stream.on('error', err => reject(err))
    stream.on('end', async () => {
      await openExcel(session[0], filepath, buff)
      resolve()
    })
  })
}

module.exports = { handler }
