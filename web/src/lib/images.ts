/**
 * Shrinks a phone photo before upload (max 1600px JPEG) so posting works on mobile data.
 * The server re-encodes anyway (and strips EXIF); this only saves bandwidth. Falls back to the original.
 */
export async function shrinkPhoto(file: File, maxEdge = 1600): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85))
    return blob && blob.size < file.size ? blob : file
  } catch {
    return file
  }
}

/** Can this browser draw the file as a picture? (A .txt, a broken JPEG or an undecodable HEIC can't.) */
export async function canShowPhoto(file: Blob): Promise<boolean> {
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    return img.naturalWidth > 0
  } catch {
    return false
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** shrinkPhoto for the report form: throws when the file isn't a picture, so it never becomes a broken tile. */
export async function readPhoto(file: File, maxEdge = 1600): Promise<Blob> {
  const shrunk = await shrinkPhoto(file, maxEdge)
  // shrinkPhoto hands back the original when it couldn't decode it: check that one really is a picture.
  if (shrunk === file && !(await canShowPhoto(file))) throw new Error('Not a readable photo')
  return shrunk
}
