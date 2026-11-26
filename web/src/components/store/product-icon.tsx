import { BookOpen, Camera, CreditCard, FileLock2, FileText, Frame, Image as ImageIcon, Newspaper, Printer, ScrollText, Shirt, Gift, Sticker, UserSquare } from "lucide-react";
import type { ProductKind } from "@/lib/types";

const MAP: Record<ProductKind, typeof Printer> = {
  document: FileText, confidential_document: FileLock2, photo: ImageIcon, passport_photo: UserSquare, photo_frame: Frame,
  business_card: CreditCard, flyer: Newspaper, brochure: ScrollText, notebook: BookOpen, poster: Camera, sticker: Sticker, merchandise: Shirt, gift_pack: Gift, other: Printer,
};

export function ProductIcon({ kind, className }: { kind: ProductKind; className?: string }) {
  const I = MAP[kind] ?? Printer;
  return <I className={className} />;
}
