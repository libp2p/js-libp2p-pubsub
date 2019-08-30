/* eslint-env mocha */
/* eslint max-nested-callbacks: ["error", 5] */
'use strict'

const chai = require('chai')
chai.use(require('dirty-chai'))
const expect = chai.expect

const { Message } = require('../src/message')
const {
  signMessage,
  SignPrefix,
  verifySignature
} = require('../src/message/sign')
const PeerId = require('peer-id')
const { randomSeqno } = require('../src/utils')

describe('message signing', () => {
  let peerId
  before(async () => {
    peerId = await new Promise((resolve, reject) => {
      peerId = PeerId.create({
        bits: 1024
      }, (err, id) => {
        if (err) {
          reject(err)
        }
        resolve(id)
      })
    })
  })

  it('should be able to sign and verify a message', () => {
    const message = {
      from: peerId.id,
      data: 'hello',
      seqno: randomSeqno(),
      topicIDs: ['test-topic']
    }

    const bytesToSign = Buffer.concat([SignPrefix, Message.encode(message)])

    return new Promise((resolve, reject) => {
      peerId.privKey.sign(bytesToSign, async (err, expectedSignature) => {
        if (err) return reject(err)

        const signedMessage = await signMessage(peerId, message)

        // Check the signature and public key
        expect(signedMessage.signature).to.eql(expectedSignature)
        expect(signedMessage.key).to.eql(peerId.pubKey.bytes)

        // Verify the signature
        const verified = await verifySignature(signedMessage)
        expect(verified).to.eql(true)

        resolve()
      })
    })
  })

  it('should be able to extract the public key from an inlined key', () => {
    return new Promise((resolve, reject) => {
      PeerId.create({ keyType: 'secp256k1', bits: 256 }, (err, secPeerId) => {
        if (err) return reject(err)

        const message = {
          from: secPeerId.id,
          data: 'hello',
          seqno: randomSeqno(),
          topicIDs: ['test-topic']
        }

        const bytesToSign = Buffer.concat([SignPrefix, Message.encode(message)])

        secPeerId.privKey.sign(bytesToSign, async (err, expectedSignature) => {
          if (err) return reject(err)

          const signedMessage = await signMessage(secPeerId, message)

          // Check the signature and public key
          expect(signedMessage.signature).to.eql(expectedSignature)
          signedMessage.key = undefined

          // Verify the signature
          const verified = await verifySignature(signedMessage)
          expect(verified).to.eql(true)

          resolve()
        })
      })
    })
  })

  it('should be able to extract the public key from the message', () => {
    const message = {
      from: peerId.id,
      data: 'hello',
      seqno: randomSeqno(),
      topicIDs: ['test-topic']
    }

    const bytesToSign = Buffer.concat([SignPrefix, Message.encode(message)])

    return new Promise((resolve, reject) => {
      peerId.privKey.sign(bytesToSign, async (err, expectedSignature) => {
        if (err) return reject(err)

        const signedMessage = await signMessage(peerId, message)

        // Check the signature and public key
        expect(signedMessage.signature).to.eql(expectedSignature)
        expect(signedMessage.key).to.eql(peerId.pubKey.bytes)

        // Verify the signature
        const verified = await verifySignature(signedMessage)
        expect(verified).to.eql(true)

        resolve()
      })
    })
  })
})
