HARDWARE STORE CASH BOOK
========================

A simple digital cash book for a hardware shop.
See FEATURES.txt for the full list of features.
It works completely WITHOUT internet. No installation is needed.

HOW TO START
------------
1. Unzip (Extract All) this folder to a place you will not delete,
   for example:  C:\HardwareStore
2. Open the folder and double-click  index.html
   It opens in your browser (Google Chrome or Microsoft Edge is best).
3. Tip: right-click index.html > Send to > Desktop (create shortcut),
   so you can open it quickly every day.

AUTOMATIC BACKUP (recommended - turn it on once)
-------------------------------------------------
1. Make a new folder, for example  D:\HardwareStoreBackup  (not on the Desktop or in Documents;
   a USB drive or OneDrive folder is even better).
2. Log in as owner > menu "Backup & Restore" > "Choose Backup Folder" > select that folder > Allow.
3. From now on the software saves a copy of all records in that folder by itself, about one
   second after every change. It also keeps a dated copy for each of the last 14 days.
   The menu shows "Auto-backup ON". No manual backup is needed.
4. If the browser asks for permission again after it was closed, press "Resume" (logging in
   also asks) and choose Allow.
5. If the records are ever lost: Backup & Restore > Restore Backup > pick
   hardware-store-backup.json from that folder (works on the first-start screen too).
* Works in Google Chrome and Microsoft Edge. The software also keeps a hidden recovery copy
  inside the browser and brings the records back by itself if the main browser storage is empty.

IMPORTANT - READ THIS
---------------------
* Your records are saved INSIDE THE BROWSER on this computer.
* Always open the software in the SAME browser, from the SAME folder.
  Moving the folder or using another browser will show an empty book.
* Do NOT clear "browsing data / site data / cookies" in the browser.
  That can delete your records.
* Turn on AUTOMATIC BACKUP (see above). If your browser cannot do it, make a backup by hand
  every week (menu: Backup & Restore > Download Backup) and keep the file on a USB drive.
* To move to another computer or browser: download a backup on the old one,
  then use Restore Backup on the new one.

WHAT YOU CAN RECORD
-------------------
* Income / Sales (cash or credit)
* Customers: credit given and payments received
* Suppliers: bills (amount owed) and payments made
* Expenses (rent, electricity, salary ...)
* Loans: money you borrowed and money you gave, with repayments
* Stock: products, stock added, stock sold and how much remains in the store,
  and an Items To Order list
* Cash Book: automatic cash balance
* Reports: today, yesterday, this week, this month or any dates. "Print Report" prints
  a professional A4 report with your shop name, address and phone number.
  "Download Report (PDF)" saves the same report as a PDF file you can send or keep
  (Reports and Cash Book pages). Urdu letters cannot be shown in the PDF file; for
  those use Print and choose "Save as PDF".
  (Owner: add the address and phone with "Edit Shop Details" on the Reports page,
  or in Settings.)
  Every printed page has the shop header at the top and "Page 1 of 3" at the bottom
  (needs Chrome or Edge version 131 or newer; use Update in the browser menu).
  In the print window, turn OFF "Headers and footers" for a clean page.

FIRST STEPS
-----------
1. The first time you open the software, it asks you to create the OWNER (admin)
   account: shop name, your name, a username and a password (6+ characters).
2. It then shows a RECOVERY KEY. WRITE IT ON PAPER and keep it safe. It is the
   only way to set a new password if you forget the owner password.
3. After that, you log in with your username and password every time.
4. Open "Settings" and enter the cash you have in hand now ("Opening Cash Balance").
5. Use the buttons on the Dashboard to add income, expenses, customers, etc.

LOGIN AND USERS
---------------
* Menu "Account & Users": change your password, and (owner only) add STAFF users.
  Staff can record entries and see reports, but cannot open Settings or
  Backup & Restore. The owner can reset a staff password or delete a staff user.
* Forgot the owner password? On the login page press "Forgot password?" and enter
  the recovery key. A new recovery key is then shown - write it down again.
* After 5 wrong passwords the login waits 30 seconds.
* Login details are saved with your records and are included in the backup file.
  Keep the backup file private.
* This login keeps other people out of the software in normal use. Please also keep
  the computer itself protected (Windows password).

NOTES
-----
* Stock is a simple list: you enter what arrives and what is sold. It is separate from
  the cash book, so record the money for a sale in Income / Sales as usual.
* "Net Recorded Income" in Reports is only Income minus recorded Expenses.
  It is not real profit, because the cost of goods is not recorded.
* A customer or supplier with saved records cannot be deleted until those
  records are deleted first. This protects your accounts.
