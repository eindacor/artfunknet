# Vintage/HoF update notes

1. The hall of fame should be a section of the main player page and should be styled similarly. 

2. The HoF items need to be actually rendered instead of a record of their stats. Make sure that when the items are removed enough item info is preserved to properly show all of the stats at the time of removal. For items still in the game they can just show the item itself.

3. Players need to be notified that an item they obtained is now in the hall of fame. From the admin panel or from a natural source.

4. Make sure existing items in the game aren't scanned and added to the HoF. Instead of adding the items to the HoF record directly, add them to the Hall of Fame admin section as submittals that an admin can approve or deny. 

5. Provide a way for admins to delete hall of fame records

6. The "enter a new era" button is illegible. 

7. The Play History area should be styled like the rest of the panels. It should show each stapshotted item of the final submitted gallery in a horizontal 1d array. Shrink the size of the cards and overlap them slightly if needed. 

8. The items int he snapshotted gallery wall show 38 items, which is impossible based on the game logic. Make sure the snapshotted gallery only includes what was on display at the time of pressing the button. 

9. Review the logic made in the previous change and make sure it honors what was written in the end_of_playthrough.md document that was created. Highlight differences and check for security or logical issues with its implementation.