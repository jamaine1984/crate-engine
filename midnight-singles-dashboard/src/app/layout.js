import './globals.css';

export const metadata = {
  title: 'Midnight Singles International — Command Center',
  description: 'Dashboard for Midnight Singles International',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
