const admin = require('firebase-admin')

admin.initializeApp()
const db = admin.firestore()

const updateOriginalColumnHeaders = async (id, filepath, originalCols) => {
  try {
    const trx = await db.collection('sessions').doc(id)
      .update({
        originalCols,
        'files.upload': filepath,
      })
    return [trx, null]
  } catch (err) {
    return [null, err]
  }
}

module.exports = { updateOriginalColumnHeaders }
