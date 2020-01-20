import attachmentApi from '@/api/attachment'
import { remote, nativeImage } from 'electron'
import { MimeType } from '@/utils/constants'
// @ts-ignore
import uuidv4 from 'uuid/v4'
// @ts-ignore
import jo from 'jpeg-autorotate'
import fs from 'fs'
import path from 'path'
import sizeOf from 'image-size'
import cryptoAttachment from '@/crypto/crypto_attachment'
import { base64ToUint8Array } from '@/utils/util'
import conversationAPI from '@/api/conversation'
import signalProtocol from '@/crypto/signal'

import { SequentialTaskQueue } from 'sequential-task-queue'
export let downloadQueue = new SequentialTaskQueue()

export async function downloadAttachment(message: any) {
  try {
    const response = await attachmentApi.getAttachment(message.content)
    if (response.data.data) {
      let dir
      if (message.category.endsWith('_IMAGE')) {
        dir = getImagePath()
      } else if (message.category.endsWith('_VIDEO')) {
        dir = getVideoPath()
      } else if (message.category.endsWith('_DATA')) {
        dir = getDocumentPath()
      } else if (message.category.endsWith('_AUDIO')) {
        dir = getAudioPath()
      } else {
        return null
      }
      if (message.category.startsWith('SIGNAL_')) {
        const data = await getAttachment(response.data.data.view_url)
        const m = message
        const mediaKey = base64ToUint8Array(m.media_key).buffer
        const mediaDigest = base64ToUint8Array(m.media_digest).buffer
        const resp = await cryptoAttachment.decryptAttachment(data, mediaKey, mediaDigest)
        const name = generateName(m.name, m.media_mime_type, m.category, m.message_id)
        const filePath = path.join(dir, name)
        fs.writeFileSync(filePath, Buffer.from(resp))

        try {
          let { buffer } = await jo.rotate(filePath, {})
          fs.writeFileSync(filePath, buffer)
          return [m, filePath]
        } catch (e) {
          return [m, filePath]
        }
      } else {
        const data: any = await getAttachment(response.data.data.view_url)
        const m = message
        const name = generateName(m.name, m.media_mime_type, m.category, m.message_id)
        const filePath = path.join(dir, name)
        fs.writeFileSync(filePath, Buffer.from(data))
        try {
          let { buffer } = await jo.rotate(filePath, {})
          fs.writeFileSync(filePath, buffer)
          return [m, filePath]
        } catch (e) {
          return [m, filePath]
        }
      }
    }
  } catch (e) {
    return null
  }
}

function processAttachment(imagePath: any, mimeType: string, category: any, id: any) {
  const fileName = path.parse(imagePath).base
  let type :string = mimeType
  // @ts-ignore
  if (mimeType && mimeType.length > 0) type = path.parse(imagePath).extension
  const destination = path.join(getImagePath(), generateName(fileName, type, category, id))
  fs.copyFileSync(imagePath, destination)
  return { localPath: destination, name: fileName }
}

export async function base64ToImage(img: string, mimeType: any) {
  let data = img.replace(/^data:image\/\w+;base64,/, '')
  let buf = Buffer.from(data, 'base64')
  const destination = path.join(getImagePath(), generateName('', mimeType, '_IMAGE', ''))
  await fs.writeFileSync(destination, buf)
  return { path: destination, type: mimeType }
}

function toArrayBuffer(buf: string | any[] | Buffer) {
  let ab = new ArrayBuffer(buf.length)
  let view = new Uint8Array(ab)
  for (let i = 0; i < buf.length; ++i) {
    view[i] = buf[i]
  }
  return ab
}
function base64Thumbnail(url: string, width: number, height: number) {
  let image = nativeImage.createFromPath(url)
  if (width > height) {
    image = image.resize({ width: 48, height: height / (width / 48), quality: 'good' })
  } else {
    image = image.resize({ width: width / (height / 48), height: 48, quality: 'good' })
  }
  let base64str = image.toPNG().toString('base64')

  return base64str
}

function putHeader(buffer: any) {
  return {
    method: 'PUT',
    body: buffer,
    headers: {
      'x-amz-acl': 'public-read',
      Connection: 'close',
      'Content-Length': buffer.byteLength,
      'Content-Type': 'application/octet-stream'
    }
  }
}

export async function putAttachment(imagePath: any, mimeType: any, category: string, id: any, processCallback: any, sendCallback: any, errorCallback: any) {
  const { localPath, name } = processAttachment(imagePath, mimeType, category, id)
  let mediaWidth: number = 0
  let mediaHeight: number = 0
  let thumbImage: string | null = null
  if (category.endsWith('_IMAGE')) {
    // @ts-ignore
    const dimensions = sizeOf(localPath)
    mediaWidth = dimensions.width
    mediaHeight = dimensions.height
    thumbImage = base64Thumbnail(localPath, mediaWidth, mediaHeight)
    // thumbImage =
    //   'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAA3NCSVQICAjb4U/gAAAAYUlEQVRoge3PQQ0AIBDAMMC/tBOFCB4Nyapg2zOzfnZ0wKsGtAa0BrQGtAa0BrQGtAa0BrQGtAa0BrQGtAa0BrQGtAa0BrQGtAa0BrQGtAa0BrQGtAa0BrQGtAa0BrQGtAub6QLkWqfRyQAAAABJRU5ErkJggg=='
  }
  let buffer = fs.readFileSync(localPath)
  let key: Iterable<number>
  let digest: Iterable<number>
  const message = {
    name: name,
    mediaSize: buffer.byteLength,
    mediaWidth: mediaWidth,
    mediaHeight: mediaHeight,
    mediaUrl: `file://${localPath}`,
    mediaMimeType: mimeType,
    thumbImage: thumbImage
  }
  if (category.startsWith('SIGNAL_')) {
    // @ts-ignore
    key = libsignal.crypto.getRandomBytes(64)
    // @ts-ignore
    const iv = libsignal.crypto.getRandomBytes(16)
    const buf = toArrayBuffer(buffer)
    await cryptoAttachment.encryptAttachment(buf, key, iv).then((result: { ciphertext: Buffer; digest: any }) => {
      buffer = result.ciphertext
      digest = result.digest
    })
  }
  processCallback(message)
  const result = await conversationAPI.requestAttachment()
  if (result.status !== 200) {
    errorCallback(`Error ${result.status}`)
    return
  }
  const url = result.data.data.upload_url
  const attachmentId = result.data.data.attachment_id
  fetch(url, putHeader(buffer)).then(
    function(resp: { status: number }) {
      if (resp.status === 200) {
        sendCallback({
          attachment_id: attachmentId,
          mime_type: mimeType,
          size: buffer.byteLength,
          width: mediaWidth,
          height: mediaHeight,
          name: name,
          thumbnail: thumbImage,
          digest: btoa(String.fromCharCode(...new Uint8Array(digest))),
          key: btoa(String.fromCharCode(...new Uint8Array(key)))
        })
      } else {
        errorCallback(resp.status)
      }
    },
    (error: any) => {
      errorCallback(error)
    }
  )
}

export async function uploadAttachment(localPath: string | number | Buffer | import('url').URL, category: string, sendCallback: { (attachmentId: any, key: any, digest: any): void; (arg0: any, arg1: string, arg2: string): void }, errorCallback: { (e: any): void; (arg0: string | number): void }) {
  let key: Iterable<number>
  let digest: Iterable<number>
  let buffer = fs.readFileSync(localPath)
  if (category.startsWith('SIGNAL_')) {
    // @ts-ignore
    key = libsignal.crypto.getRandomBytes(64)
    // @ts-ignore
    const iv = libsignal.crypto.getRandomBytes(16)
    const buf = toArrayBuffer(buffer)
    await cryptoAttachment.encryptAttachment(buf, key, iv).then((result: { ciphertext: Buffer; digest: any }) => {
      buffer = result.ciphertext
      digest = result.digest
    })
  }
  const result = await conversationAPI.requestAttachment()
  if (result.status !== 200) {
    errorCallback(`Error ${result.status}`)
    return
  }
  const url = result.data.data.upload_url
  const attachmentId = result.data.data.attachment_id
  fetch(url, putHeader(buffer)).then(
    function(resp: { status: number }) {
      if (resp.status === 200) {
        sendCallback(
          attachmentId,
          btoa(String.fromCharCode(...new Uint8Array(key))),
          btoa(String.fromCharCode(...new Uint8Array(digest)))
        )
      } else {
        errorCallback(resp.status)
      }
    },
    (error: any) => {
      errorCallback(error)
    }
  )
}

function generateName(fileName: string, mimeType: string, category: string, id: string) {
  const date = new Date()
  if (!id) {
    id = uuidv4()
  }
  const name = `${date.getFullYear()}${date.getMonth()}${date.getDay()}_${date.getHours()}${date.getMinutes()}_${Math.abs(
    signalProtocol.convertToDeviceId(id)
  )}`
  let header
  if (category.endsWith('_IMAGE')) {
    header = 'IMG'
  } else if (category.endsWith('_VIDEO')) {
    header = 'VID'
    return `${header}_${name}.mp4`
  } else if (category.endsWith('_DATA')) {
    header = 'FILE'
  } else if (category.endsWith('_AUDIO')) {
    header = 'AUDIO'
    return `${header}_${name}.ogg`
  }
  let extension
  if (mimeType === MimeType.JPEG.name) {
    extension = MimeType.JPEG.extension
  } else if (mimeType === MimeType.PNG.name) {
    extension = MimeType.PNG.extension
  } else if (mimeType === MimeType.GIF.name) {
    extension = MimeType.GIF.extension
  } else if (mimeType === MimeType.BMP.name) {
    extension = MimeType.BMP.extension
  } else if (mimeType === MimeType.WEBP.name) {
    extension = MimeType.WEBP.extension
  } else {
    let fileArr = fileName.split('.')
    if (fileArr) {
      extension = fileArr.pop()
    }
  }
  if (extension) {
    return `${header}_${name}.${extension}`
  } else {
    return `${header}_${name}`
  }
}

export function isImage(mimeType: string) {
  if (
    mimeType === MimeType.JPEG.name ||
    mimeType === MimeType.JPEG.name ||
    mimeType === MimeType.PNG.name ||
    mimeType === MimeType.GIF.name ||
    mimeType === MimeType.BMP.name ||
    mimeType === MimeType.WEBP.name
  ) {
    return true
  } else {
    return false
  }
}

function parseFile(blob: Blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = function(event: any) {
      const content = event.target.result
      resolve(content)
    }
    reader.onerror = function(event) {
      reject(event)
    }
    reader.readAsArrayBuffer(blob)
  })
}

function getAttachment(url: RequestInfo) {
  return fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/octet-stream'
    }
  })
    .then(function(resp: any) {
      let code: any = parseInt(resp.status)
      if (code !== 200) {
        throw Error(code)
      }
      return resp.blob()
    })
    .then(function(blob) {
      if (!blob) {
        throw Error('Error data')
      }
      return parseFile(blob)
    })
}

function getImagePath() {
  const dir = path.join(getMediaPath(), 'Image')
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir)
  }
  return dir
}

function getVideoPath() {
  const dir = path.join(getMediaPath(), 'Video')
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir)
  }
  return dir
}

function getAudioPath() {
  const dir = path.join(getMediaPath(), 'Audio')
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir)
  }
  return dir
}

function getDocumentPath() {
  const dir = path.join(getMediaPath(), 'Files')
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir)
  }
  return dir
}

function getMediaPath() {
  const dir = path.join(getAppPath(), 'media')
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir)
  }
  return dir
}

function getAppPath() {
  const dir = remote.app.getPath('userData')
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir)
  }
  return dir
}