/** Today's date (YYYY-MM-DD) where the group lives, so "overdue" and "ended" agree with the app and the reminder emails. */
export const localDay=(timeZone=process.env.REMINDER_TZ||'Europe/Berlin',now=new Date())=>
 new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
