import { Link } from 'react-router-dom';
import './BackLink.css';

type BackLinkProps = { to: string; label: string };

export function BackLink({ to, label }: BackLinkProps) {
  return (
    <Link to={to} className="back-link btn-ghost">
      ← {label}
    </Link>
  );
}
