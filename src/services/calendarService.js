import { google } from 'googleapis';
import dotenv from 'dotenv';
dotenv.config();

const auth = new google.auth.GoogleAuth({
    keyFile: './assets/wcmanager-585cfa0449d4.json', 
    scopes: ['https://www.googleapis.com/auth/calendar.events'],
});

const calendar = google.calendar({ version: 'v3', auth });
const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID;

export const deleteMatchFromCalendar = async ({ eventId }) => {
    if (!eventId) return;

    try {
        await calendar.events.delete({ calendarId: CALENDAR_ID, eventId: eventId });
    } catch (error) {
        console.error('Error deleting from Google Calendar:', error);
        throw error; 
    }
}

export const syncMatchToCalendar = async ({ eventId, matchDate, homeAway, opponentName, teamName, competitionName, eventColor, matchTypeName, locationName, matchStatusId }) => {
    let summary = `${teamName} - ${competitionName} ${homeAway.toLowerCase() === 'away' ? 'at' : 'vs'} ${opponentName} - ${matchTypeName}`;

    if (+matchStatusId === 5) summary = `[POSTPONED] - ${summary}`;

    const eventBody = {
        summary: summary,
        location: locationName,
        colorId: eventColor,
        start: {
            dateTime: new Date(matchDate).toISOString(),
            timeZone: 'America/New_York'
        },
        end: {
            // Adding 2 hours for match duration
            dateTime: new Date(new Date(matchDate).getTime() + 2 * 60 * 60 * 1000).toISOString(),
            timeZone: 'America/New_York'
        }
    }

    try {
        if (eventId) {
            const response = await calendar.events.update({ calendarId: CALENDAR_ID, eventId: eventId, resource: eventBody });

            return response.data;
        } else {
            // Insert new event
            const response = await calendar.events.insert({ calendarId: CALENDAR_ID, resource: eventBody });

            return response.data; // This contains the new event's ID
        }
    } catch (error) {
        console.error('Error syncing with Google Calendar:', error);
        throw error;
    }
}