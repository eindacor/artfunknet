

## 1. Hall of Fame

Make a new collection somewhere in the game metadata for "hall of fame items". This will be a record that stores an item id (or raw item data, more on that later) alongside string fields "description" and "hall of fame title". Create an admin panel interface that allows the admin to enter an item number and click a "search" button. The interface will look up the item and display all the info. The admin can then hit enter text for title and description, then click a "submit" button. Submitting this info will add a hall of fame record with the title and description, and it will point to that game item. For any process that would remove an item from the game entirely (archive, quick sell, collector sell, donate, vintage cleanout, etc.), check the hall of fame records to see if that item is there. If it is, transfer ownership of the item to the artfunkel inc. user instead.

In addition, create a registry system for automatically detecting certain types of items. Here is some pseudocode to describe the pattern....

```
registerHallOfFameQualifier(string title, string description, map query)
```

example uses:

```
	registerHallOfFameQualifier(
		"First mint masterpiece", 
		"The first mint masterpiece found in the game",
		{
			rarity: "masterpiece",
			mint: true
		}
	);

	registerHallOfFameQualifier(
		"First foil unlocked legendary", 
		"The first legendary item to be foil and unlocked",
		{
			rarity: "legendary",
			foil: true,
			unlocked: true
		}
	);
```

Then when an item is created it could call a process like...

```
hallOfFameService.checkItemForHallOfFameStatus(item);
```

That would run through all of the registered queries to see if a it satisfies one of the hall of fame requirements. If it does, add it to the Hall of fame metadata and notify the player. Include queries for the first foil masterpiece, first unlocked masterpiece, first unlocked foil, and other permutations of foil, mint, unlocked masterpieces. Also 



## 2. Final gallery submittal

When a player reaches level 50, they can currently press a button that opens a modal that lets them select which item they would want to turn into a vintage item before moving on to the next playthrough. Remove that modal and that behavior, and replace it with a "enter a new era" button. When pressed, a modal opens that tells the player they're about to enter a new playthrough, and that their items will be removed except for one. It prompts the user to select 10 items for "vintage consideration". They can't be vintage or original items, and to submit they must include all 10. The player must have zero active auctions (selling or currently winning). When the user selects "submit". One of the items submitted is picked to become the vintage item for the next playthrough. Upon submittal, take a snapshot of any metadata collected by the player during that playthrough (visitors met, items collected, money spent). Add trackers for this data if it doesn't already exist. For every item in the player's gallery at the time of pressing the button, record the item data for each and store it in a "playthrough snapshot" record to be kept with the player data. When all the metadata is recorded and the vintage item is selected, continue with the vintag process like it was before.

Create a play history section on the main page that displays all of the player's previous snapshots, including their snapshotted gallery, the vintage item from that run, and the player data that was collected. 