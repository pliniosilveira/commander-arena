/**
 * A picture of the page as the player sees it, for the issue report: the browser's own screen capture of the current tab
 * (`getDisplayMedia`), so no library is needed. The browser asks the player once per capture. Null when the browser has no
 * capture, the player declines, or anything fails: the report then goes without a picture.
 */
export async function captureBoard(): Promise<Blob | null> {
  const media = navigator.mediaDevices;
  if (media === undefined || typeof media.getDisplayMedia !== 'function') return null;
  let stream: MediaStream | null = null;
  try {
    // `preferCurrentTab` is Chromium's hint to offer this tab first; other browsers ignore it.
    stream = await media.getDisplayMedia({
      video: true,
      audio: false,
      preferCurrentTab: true,
    } as DisplayMediaStreamOptions);
    const video = document.createElement('video');
    video.muted = true;
    video.srcObject = stream;
    await video.play();
    // Let the browser's "sharing this tab" notice leave the frame.
    await new Promise<void>((resolve) => setTimeout(resolve, 400));
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (ctx === null || canvas.width === 0) return null;
    ctx.drawImage(video, 0, 0);
    return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  } catch {
    return null;
  } finally {
    for (const track of stream?.getTracks() ?? []) track.stop();
  }
}
