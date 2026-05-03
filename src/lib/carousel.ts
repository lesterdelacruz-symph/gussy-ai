export function getCarouselIndex(currentIndex: number, direction: -1 | 1, totalItems: number) {
  if (totalItems <= 0) return currentIndex;
  return (currentIndex + direction + totalItems) % totalItems;
}
