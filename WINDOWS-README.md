# Run NearBites on a Windows laptop

1. Extract the **whole ZIP** to a normal folder, such as `Documents\NearBites`. Do not run scripts from inside the ZIP.
2. Connect to the internet and double-click **SETUP-WINDOWS.bat**. It installs Bun, uv, Python 3.12, and the project dependencies, then updates the included database. The YOLO/PyTorch download is large and may take a while. Windows 10 version 1809+ or Windows 11, an x64 processor, and several GB of free disk space are recommended.
3. Double-click **START-WINDOWS.bat**. Keep both server windows open. The buyer app opens at <http://127.0.0.1:8080>; API documentation is at <http://127.0.0.1:8000/api/v1/docs>.
4. Use the local demo login details in `LOCAL-DEMO-LOGINS.txt` inside this ZIP. The sample buyer can add dishes from **Order Test Kitchen** to exercise checkout. These are test orders; no food is prepared or delivered.

The ZIP includes the existing SQLite database, all current uploads, the gloves/hairnet YOLO model, and the backend `.env`. No Docker, Git, or cloud account is needed. Seller training and the camera model run locally. The app requires the two server windows to remain open.

If Windows blocks a downloaded `.bat` file, right-click it, choose **Properties**, select **Unblock**, and retry. If another program uses ports 8000 or 8080, close it before starting NearBites.

**Private bundle:** `backend\.env` includes a working Brevo key and JWT secret; the database includes account and order records. Share the ZIP only with the intended classmate. The Brevo key should be rotated after the handoff. The ZIP is not committed to GitHub.
