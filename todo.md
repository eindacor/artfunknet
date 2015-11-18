TODO list: 

- [x] ! fix ticket disappearance
- [x] ! buff drops based on player level
- [x] ! buff drops for npcs in your own gallery
- [ ] Refactor bidding system to allow for max bid, increasing your max bid, extending auctions after bid is added
- [ ] Add quests
	painting from certain time period
	painting form certain artist
	~~specific painting~~
	specific set of paintings
	visit gallery with any of the above
- [x] Add action buttons to new card UI
- [ ] Implement UI for validating scraper data
- [x] Get AWS instance running w/ Meteor Up
- [ ] Develop special text system for masterpieces
- [x] Modify gallery size to scale based on tallest painting, not thinnest
- [x] Make distance from painting to floor correspond to pixels/cm
- [x] Reduce gallery finish XP
- [x] Reduce dealer sales to be below actual value, but above quick sell value
- [ ] Update alerts to user html strings instead of plain text
- [ ] !Fix undefined references being sent to S3 bucket
- [ ] Add “active” field to all database documents. Inactive artworks are not dropped, inactive items are not seen by system, inactive users are not referenced
- [x] Make finish opacity universal for all finishes rather than specific to each finish
- [x] Add shine to foil paintings in gallery
- [ ] Nerf Rare drop rate at low levels
- [x] Fix ticket bug
- [ ] Finish special visitors
	~~Historian - quests~~
	Forger
	XP bonus
	Set bonus
	Market Expert
		shows what paintings you have access to are in demand from player quests
    displays the last price paid on the auction house for your items
- [x] Disallow spaces and special characters from usernames
- [x] Modify gallery scrolling so wall and floor patterns are part of the container that moves, instead of offsetting the background colors
- [x] Foil paintings are set lower than non-foils - make foil element get same height/weight as image in the html, then set class’ position to absolute
- [ ] Add cheat codes
	html input/button that’s hidden unless the class is set manually to “im-a-dirty-cheater”
	secret painting
	secret finish
	profile flair
	unlock secret painting droppable
- [x] Add discarded paintings to AH for a set period of time
- [ ] Add parameter-based trading system. You put a card up for trade, and specify what you’re looking for (specific attributes, xp rating, etc). Anyone can fulfill that offer and make the trade. Players can set the max trades of that type they will allow. Players can specify “legendary with >80xp rating and >80 designer”, and offer a card in return
- [ ] Generate quest targets by rolling player’s smart map and excluding legendaries/masterpieces
- [x] Make galleries smaller by updating max_height in global_variables.js
- [ ] Add more colors to wall base option
- [x] Make foils ineligible targets for auction bot	
- [ ] Create UI for loot map calibration in Admin Tools
- [x] Leave expired auctions in the database, but prevent expired items from displaying. Clear expired auctions every 10 seconds.
- [ ] Create NPC Interaction: Social Media Expert (Find better name, replace Market expert) - adds menu to your dashboard that lists galleries that currently have npc’s in them
- [ ] Add Wishlist feature for players. They select up to 3 stats they’d like to find, and loot is slightly favored to roll those items
- [ ] Refactor interval methods to use TTL indexes instead
- [x] Create tickets database instead of storing ticket information in the user profile, tickets are removed automatically
- [ ] Possibly create an unclaimed database for staged items, then transfer those items to the owned database once claimed/purchased

Things to do before open invitations
- [ ] Develop default attribute system for legendary works
- [ ] Fix sorting of inventory
- [ ] Allow filtering of Auction House
- [x] Add all-user alert system on admin tools
- [ ] Update tutorial system
- [ ] Password validation
- [x] Nerf collector rewards, increase quick sell price
- [x] Increase duration of sold paintings on AH
- [x] Add quest item indicators on cards
- [ ] Add labeling system in inventory. Add “label” field to item schema
- [x] Add XP Rating to finishes in gallery
- [ ] Fix full view modal
- [ ] Add countdown timer for unclaimed/for_sale cards
- [x] Make attribute rolls tier. 1st att rolled is good, 2nd is worse, etc. Items should always roll at least one good thing
- [x] Leave expired auctions in the database, but prevent expired items from displaying. Clear expired auctions every 10 seconds.
- [ ] Set up metadata database
	legendary drops and location
	source and quantity of money made/spent
	xp source
	player activity
	items offered to a player
- [ ] Add frame colors
