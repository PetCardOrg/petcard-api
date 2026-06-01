import { registerAs } from '@nestjs/config';

export const googleCalendarConfig = registerAs('googleCalendar', () => ({
  clientId: process.env.GOOGLE_CALENDAR_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CALENDAR_CLIENT_SECRET,
  redirectUri:
    process.env.GOOGLE_CALENDAR_REDIRECT_URI ??
    'http://localhost:3000/calendar/callback',
}));
