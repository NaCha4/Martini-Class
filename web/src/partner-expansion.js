// Match the pixels painted by object-fit: cover, including the cropped edges.
export function coverImageRect(box, naturalWidth, naturalHeight, objectPosition = '50% 50%') {
  if (!box || ![box.left, box.top, box.width, box.height, naturalWidth, naturalHeight].every(Number.isFinite)
    || Math.min(box.width, box.height, naturalWidth, naturalHeight) <= 0) return null;
  const positions = objectPosition.split(/\s+/).map(value => value.endsWith('%') ? parseFloat(value) / 100 : .5);
  const scale = Math.max(box.width / naturalWidth, box.height / naturalHeight);
  const width = naturalWidth * scale, height = naturalHeight * scale;
  return { left: box.left + (box.width - width) * (positions[0] ?? .5), top: box.top + (box.height - height) * (positions[1] ?? .5), width, height, scale };
}

export function animatePartnerPhoto(view, opening, frame, options) {
  const { dialog, origin } = view, doc = dialog.ownerDocument;
  const photo = origin?.querySelector?.('.member-benefit-photo'), source = photo?.querySelector('img');
  const hero = dialog.querySelector('.partner-hero'), target = hero?.querySelector('img');
  const style = globalThis.getComputedStyle;
  if (!source?.complete || !source.naturalWidth || !target || !style || !doc?.createElement) return null;
  const fromBox = photo.getBoundingClientRect(), toBox = target.getBoundingClientRect();
  const from = coverImageRect(fromBox, source.naturalWidth, source.naturalHeight, style(source).objectPosition);
  const to = coverImageRect(toBox, source.naturalWidth, source.naturalHeight, style(target).objectPosition);
  if (!from || !to || toBox.top + toBox.height <= frame.top || toBox.top >= frame.bottom) return null;
  const layer = doc.createElement('div');
  if (!layer.animate) return null;
  const previous = view.photoTransition?.snapshot();
  view.photoTransition?.cancel();
  const viewport = doc.createElement('div'), image = doc.createElement('img');
  const shades = [doc.createElement('div'), doc.createElement('div')];
  layer.className = 'partner-photo-transition';layer.setAttribute('aria-hidden', 'true');
  viewport.className = 'partner-photo-transition-window';
  image.src = source.currentSrc || source.src;image.alt = '';image.draggable = false;
  image.style.width = source.naturalWidth + 'px';image.style.height = source.naturalHeight + 'px';
  const backgrounds = [style(photo, '::after').backgroundImage, style(hero, '::after').backgroundImage];
  shades.forEach((shade, index) => {
    shade.className = 'partner-photo-transition-shade';
    shade.style.width = toBox.width + 'px';shade.style.height = toBox.height + 'px';
    shade.style.backgroundImage = backgrounds[index];
  });
  viewport.append(image, ...shades);layer.append(viewport);dialog.append(layer);
  dialog.classList.add('is-image-expanding');
  const clip = box => 'inset(' + (box.top - frame.top) + 'px ' + (frame.right - box.left - box.width) + 'px ' + (frame.bottom - box.top - box.height) + 'px ' + (box.left - frame.left) + 'px)';
  const transform = rect => 'translate(' + (rect.left - frame.left) + 'px,' + (rect.top - frame.top) + 'px) scale(' + rect.scale + ')';
  const shadeTransform = box => 'translate(' + (box.left - frame.left) + 'px,' + (box.top - frame.top) + 'px) scale(' + box.width / toBox.width + ',' + box.height / toBox.height + ')';
  const begin = opening ? from : to, end = opening ? to : from;
  const beginBox = opening ? fromBox : toBox, endBox = opening ? toBox : fromBox;
  const motions = [], timing = { ...options, fill: 'both' };
  const play = (element, start, finish) => motions.push(element.animate([start, finish], timing));
  play(viewport, { clipPath: previous?.clip || clip(beginBox) }, { clipPath: clip(endBox) });
  play(image, { transform: previous?.image || transform(begin) }, { transform: transform(end) });
  shades.forEach((shade, index) => play(shade,
    { transform: previous?.shades[index].transform || shadeTransform(beginBox), opacity: previous?.shades[index].opacity ?? Number(opening ? index === 0 : index === 1) },
    { transform: shadeTransform(endBox), opacity: Number(opening ? index === 1 : index === 0) }));
  const copy = Array.from(dialog.querySelectorAll('.partner-hero-title,.partner-benefits-copy,.partner-coupon-area,.dialog-frame>header'));
  copy.forEach((element, index) => play(element, { opacity: previous?.copy[index] ?? Number(!opening) }, { opacity: Number(opening) }));
  const scroller = dialog.querySelector('.dialog-scroll'), win = doc.defaultView;
  let stopped = false;
  const cleanup = () => {
    if (stopped) return;stopped = true;
    for (const motion of motions) motion.cancel();
    layer.remove();scroller?.removeEventListener('scroll', cleanup);win?.removeEventListener('resize', cleanup);
    if (view.photoTransition === controller) { view.photoTransition = null;dialog.classList.remove('is-image-expanding'); }
  };
  const controller = {
    cancel: cleanup,
    snapshot: () => ({ clip: style(viewport).clipPath, image: style(image).transform, shades: shades.map(shade => ({ transform: style(shade).transform, opacity: style(shade).opacity })), copy: copy.map(element => style(element).opacity) }),
    finished: Promise.all(motions.map(motion => motion.finished.catch(() => {}))).finally(() => { if (opening) cleanup(); }),
  };
  view.photoTransition = controller;
  scroller?.addEventListener('scroll', cleanup, { passive: true });win?.addEventListener('resize', cleanup);
  return controller;
}
