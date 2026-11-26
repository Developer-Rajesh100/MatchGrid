import React from 'react';
import { NavLink } from 'react-router-dom';

export function Footer() {
  return (
    <footer className="brand-footer">
      <div className="footer-row">
        <NavLink to="/" className="footer-brand">
          <img src="/brand/matchgrid-logo.png" alt="" />
          <span>MatchGrid</span>
        </NavLink>
        <nav className="footer-links" aria-label="Footer">
          <NavLink to="/">Tournaments</NavLink>
          <NavLink to="/login">Staff sign in</NavLink>
        </nav>
        <span className="footer-copy">&copy; {new Date().getFullYear()} MatchGrid</span>
      </div>
    </footer>
  );
}
export default Footer;
