import { useEffect, useState } from "react";

function App() {
  const [date, setDate] = useState(new Date());

  useEffect(() => {
    setInterval(() => {
      setDate(new Date());

      return () => {};
    }, 1000);
  }, [date]);

  const formatted = (date: Date) =>
    date.toLocaleString("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });

  return (
    <>
      <h1>Hello React Good Morning! {formatted(date)}</h1>
    </>
  );
}

export default App;
