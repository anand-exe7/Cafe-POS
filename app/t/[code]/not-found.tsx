import Link from "next/link";
import { Cherry } from "../../_components/bits";
import "../table.css";

export default function TableNotFound() {
  return (
    <main className="tm-lost">
      <Cherry size={44} />
      <h1>
        This table code <em>isn&apos;t active.</em>
      </h1>
      <p>The QR may have been replaced. Please ask our staff — they&apos;ll get you sorted in a minute.</p>
      <Link href="/" className="tm-send">
        Pick your table
      </Link>
    </main>
  );
}
