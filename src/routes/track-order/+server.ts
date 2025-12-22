import { google } from 'googleapis';
import type { RequestHandler } from './$types';
import { SERVICE_ACCOUNT_EMAIL, SERVICE_ACCOUNT_KEY, SPREADSHEET_ID } from '$env/static/private';

export const GET: RequestHandler = async ({ url }) => {
	console.log({
		SERVICE_ACCOUNT_EMAIL,
		SERVICE_ACCOUNT_KEY,
		SPREADSHEET_ID
	});
	const orderNumber = url.searchParams.get('orderNumber');
	const email = url.searchParams.get('email');

	if (!orderNumber) {
		return new Response(JSON.stringify({ error: 'orderNumber parameter is required' }), {
			status: 400,
			headers: {
				'Access-Control-Allow-Origin': 'https://cocooriginalmm.com',
				'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
				'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
				'Access-Control-Allow-Credentials': 'true',
				'Content-Type': 'application/json'
			}
		});
	}

	const corsHeaders = {
		'Access-Control-Allow-Origin': 'https://cocooriginalmm.com',
		'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
		'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
		'Access-Control-Allow-Credentials': 'true',
		'Content-Type': 'application/json'
	};

	try {
		const auth = new google.auth.GoogleAuth({
			credentials: {
				client_email: SERVICE_ACCOUNT_EMAIL,
				private_key: SERVICE_ACCOUNT_KEY.replace(/\\n/g, '\n')
			},
			scopes: ['https://www.googleapis.com/auth/spreadsheets']
		});
		const sheets = google.sheets({ version: 'v4', auth });
		const spreadsheetId = SPREADSHEET_ID;
		const sheetsResponse = await sheets.spreadsheets.values.get({
			spreadsheetId,
			range: 'Sheet1'
		});
		const values = sheetsResponse.data.values;

		if (!values || values.length === 0) {
			return new Response(JSON.stringify([]), { headers: corsHeaders });
		}

		const headerRow = values[0];
		const orderNumberIndex = headerRow.indexOf('ID');
		const emailIndex = headerRow.indexOf('Email');
		// const orderNumberIndex = headerRow.indexOf('Order Number');
		// const emailIndex = headerRow.indexOf('Email');

		const matchingOrderRow = values.slice(1).find((row) => {
			return row[orderNumberIndex] === orderNumber;
		});

		const otherOrdersRows = email
			? values.slice(1).filter((row) => {
					const orderMatches = row[orderNumberIndex] === orderNumber;
					const emailMatches = row[emailIndex] === email;

					return emailMatches && !orderMatches;
				})
			: [];

		const slugify = (text: string) => {
			return text
				.toLowerCase()
				.replace(/[^a-z0-9\s]/g, '')
				.replace(/\s+/g, '_')
				.trim();
		};

		const createOrderObject = (row: string[]) => {
			const order: Record<string, string> = {};
			headerRow.forEach((header, index) => {
				const slug = slugify(header);
				order[slug] = row[index] || '';
			});
			return order;
		};

		const matchingOrder = matchingOrderRow ? createOrderObject(matchingOrderRow) : null;
		const otherOrders = otherOrdersRows.map((row) => createOrderObject(row));

		const apiResponse = {
			order: matchingOrder,
			other_orders: otherOrders
		};

		return new Response(JSON.stringify(apiResponse), { headers: corsHeaders });
	} catch (err) {
		console.error('Error fetching data from Google Sheets:', err);
		return new Response(JSON.stringify({ error: 'Internal server error' }), {
			status: 500,
			headers: corsHeaders
		});
	}
};

export const OPTIONS: RequestHandler = () => {
	return new Response(null, {
		status: 200,
		headers: {
			'Access-Control-Allow-Origin': 'https://cocooriginalmm.com',
			'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
			'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
			'Access-Control-Allow-Credentials': 'true'
		}
	});
};
