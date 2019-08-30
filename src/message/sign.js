'use strict'

const PeerId = require('peer-id')
const { Message } = require('./index')
const SignPrefix = Buffer.from('libp2p-pubsub:')

/**
 * Signs the provided message with the given `peerId`
 *
 * @param {PeerId} peerId
 * @param {Message} message
 * @returns {Promise<Message>}
 */
function signMessage (peerId, message) {
  // Get the message in bytes, and prepend with the pubsub prefix
  const bytes = Buffer.concat([
    SignPrefix,
    Message.encode(message)
  ])

  return new Promise((resolve, reject) => {
    // Sign the bytes with the private key
    peerId.privKey.sign(bytes, (err, signature) => {
      if (err) return reject(err)

      resolve({
        ...message,
        signature: signature,
        key: peerId.pubKey.bytes
      })
    })
  })
}

/**
 * Verifies the signature of the given message
 * @param {rpc.RPC.Message} message
 * @returns {Promise<Boolean>}
 */
async function verifySignature (message) {
  // Get message sans the signature
  const baseMessage = { ...message }
  delete baseMessage.signature
  delete baseMessage.key
  const bytes = Buffer.concat([
    SignPrefix,
    Message.encode(baseMessage)
  ])

  // Get the public key
  const pubKey = await messagePublicKey(message)

  // Verify the base message
  return new Promise((resolve, reject) => {
    pubKey.verify(bytes, message.signature, (err, res) => {
      if (err) {
        return reject(err)
      }
      resolve(res)
    })
  })
}

/**
 * Returns the PublicKey associated with the given message.
 * If no, valid PublicKey can be retrieved an error will be returned.
 *
 * @param {Message} message
 * @returns {Promise<PublicKey>}
 */
function messagePublicKey (message) {
  return new Promise((resolve, reject) => {
    if (message.key) {
      PeerId.createFromPubKey(message.key, (err, peerId) => {
        if (err) return reject(err)
        // the key belongs to the sender, return the key
        if (peerId.isEqual(message.from)) return resolve(peerId.pubKey)
        // We couldn't validate pubkey is from the originator, error
        return reject(new Error('Public Key does not match the originator'))
      })
    } else {
      // should be available in the from property of the message (peer id)
      const from = PeerId.createFromBytes(message.from)
      if (from.pubKey) {
        return resolve(from.pubKey)
      } else {
        reject(new Error('Could not get the public key from the originator id'))
      }
    }
  })
}

module.exports = {
  messagePublicKey,
  signMessage,
  SignPrefix,
  verifySignature
}
