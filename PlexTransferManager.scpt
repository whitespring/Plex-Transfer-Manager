-- Plex Transfer Manager Launcher for macOS
-- This AppleScript launches the startup script in Terminal

on run
	try
		-- Get the directory of this script
		set scriptPath to (path to me as text)
		set scriptFolder to text 1 thru -((offset of ":" in (reverse of characters of scriptPath) as text) + 1) of scriptPath

		-- Path to the startup script
		set startupScript to scriptFolder & "start-server.sh"

		-- Check if the startup script exists
		tell application "System Events"
			if exists file startupScript then
				-- Launch Terminal and run the startup script
				tell application "Terminal"
					activate
					do script "cd \"" & scriptFolder & "\" && chmod +x start-server.sh && ./start-server.sh"
				end tell
			else
				display dialog "Error: start-server.sh not found in " & scriptFolder & ". Please ensure the startup script is in the same directory as this application." buttons {"OK"} default button "OK" with icon stop
			end if
		end tell

	on error errMsg
		display dialog "Error launching Plex Transfer Manager: " & errMsg buttons {"OK"} default button "OK" with icon stop
	end try
end run
