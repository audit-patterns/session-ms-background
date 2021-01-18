const admin = require('firebase-admin')

admin.initializeApp()
const db = admin.firestore()

const updateFilepathCSV = async (id, filepath) => {
  try {
    const trx = await db.collection('sessions').doc(id)
      .update({ 'files.csv': filepath })
    return [trx, null]
  } catch (err) {
    return [null, err]
  }
}

module.exports = { updateFilepathCSV }
