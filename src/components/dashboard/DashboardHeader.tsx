import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  Sun, Moon, CloudSun, Cloud, CloudRain, CloudSnow,
  CloudLightning, CloudDrizzle, CloudFog, Snowflake
} from "lucide-react";

function getGreeting(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function weatherIcon(code: number) {
  const size = 18;
  const cls = "text-muted-foreground";
  if (code === 0) return <Sun className={cls} size={size} />;
  if (code <= 3) return <CloudSun className={cls} size={size} />;
  if (code <= 48) return <CloudFog className={cls} size={size} />;
  if (code <= 55) return <CloudDrizzle className={cls} size={size} />;
  if (code <= 65) return <CloudRain className={cls} size={size} />;
  if (code <= 67) return <Snowflake className={cls} size={size} />;
  if (code <= 77) return <CloudSnow className={cls} size={size} />;
  if (code <= 82) return <CloudRain className={cls} size={size} />;
  if (code <= 86) return <CloudSnow className={cls} size={size} />;
  if (code <= 99) return <CloudLightning className={cls} size={size} />;
  return <Cloud className={cls} size={size} />;
}

function weatherLabel(code: number): string {
  if (code === 0) return "Clear";
  if (code <= 3) return "Partly Cloudy";
  if (code <= 48) return "Foggy";
  if (code <= 55) return "Drizzle";
  if (code <= 65) return "Rain";
  if (code <= 67) return "Freezing Rain";
  if (code <= 77) return "Snow";
  if (code <= 82) return "Showers";
  if (code <= 86) return "Snow Showers";
  if (code <= 99) return "Thunderstorm";
  return "Cloudy";
}

interface Weather {
  temp: number;
  code: number;
}

export function DashboardHeader() {
  const { user } = useAuth();
  const [firstName, setFirstName] = useState<string | null>(null);
  const [now, setNow] = useState(new Date());
  const [weather, setWeather] = useState<Weather | null>(null);

  // Fetch profile first name
  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("first_name")
      .eq("user_id", user.id)
      .limit(1)
      .single()
      .then(({ data }) => {
        if (data?.first_name) setFirstName(data.first_name);
      });
  }, [user]);

  // Update clock every minute
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Fetch weather once
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude, longitude } = pos.coords;
          const res = await fetch(
            `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true&temperature_unit=fahrenheit`
          );
          const data = await res.json();
          if (data.current_weather) {
            setWeather({
              temp: Math.round(data.current_weather.temperature),
              code: data.current_weather.weathercode,
            });
          }
        } catch {
          // silently fail
        }
      },
      () => {
        // geolocation denied — no weather
      }
    );
  }, []);

  const hour = now.getHours();
  const greeting = getGreeting(hour);
  const displayName = firstName || "there";

  return (
    <div className="flex items-center justify-between mb-6">
      <h2 className="text-lg font-medium text-foreground">
        {greeting}, {displayName}
      </h2>
      <div className="text-right">
        <p className="text-sm font-medium text-foreground">{formatTime(now)}</p>
        {weather && (
          <div className="flex items-center justify-end gap-1.5 mt-0.5">
            {weatherIcon(weather.code)}
            <span className="text-xs text-muted-foreground">
              {weather.temp}°F — {weatherLabel(weather.code)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
