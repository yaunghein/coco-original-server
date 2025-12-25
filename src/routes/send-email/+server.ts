import type { RequestHandler } from './$types';
import { Resend } from 'resend';
import type { CreateEmailOptions } from 'resend';
import { RESEND_API_KEY, RESEND_FROM, SHOP_OWNER_EMAIL } from '$env/static/private';

const buildCorsHeaders = () => ({
	'Access-Control-Allow-Origin': 'https://cocooriginalmm.com',
	'Access-Control-Allow-Methods': 'POST, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
	'Access-Control-Allow-Credentials': 'true',
	'Content-Type': 'application/json'
});

export const OPTIONS: RequestHandler = () => {
	return new Response(null, {
		status: 200,
		headers: buildCorsHeaders()
	});
};

export const POST: RequestHandler = async ({ request }) => {
	if (!RESEND_API_KEY || !SHOP_OWNER_EMAIL) {
		return new Response(JSON.stringify({ error: 'Server configuration is missing' }), {
			status: 500,
			headers: buildCorsHeaders()
		});
	}

	const resend = new Resend(RESEND_API_KEY);

	try {
		const contentType = request.headers.get('content-type') || '';
		let orderNumber: string | undefined;
		let orderEmail: string | undefined;
		let fileName: string | undefined;
		let fileBuffer: Buffer | undefined;
		let uploadImage: string | undefined;

		if (contentType.includes('multipart/form-data')) {
			const fd = await request.formData();
			orderNumber = (fd.get('orderNumber') as string) || undefined;
			// Shopify snippet sends "email"
			orderEmail = ((fd.get('orderEmail') || fd.get('email')) as string) || undefined;
			const file = fd.get('file') as File | null;
			if (file) {
				fileName = file.name || 'attachment';
				const ab = await file.arrayBuffer();
				fileBuffer = Buffer.from(ab);
			}
		} else {
			const body = await request.json().catch(() => null);
			if (!body || typeof body !== 'object') {
				return new Response(JSON.stringify({ error: 'Invalid request body' }), {
					status: 400,
					headers: buildCorsHeaders()
				});
			}
			orderNumber = (body as any).orderNumber;
			orderEmail = (body as any).orderEmail || (body as any).email;
			uploadImage = (body as any).uploadImage;
		}

		if (!orderNumber) {
			return new Response(JSON.stringify({ error: 'orderNumber is required' }), {
				status: 400,
				headers: buildCorsHeaders()
			});
		}
		if (!orderEmail) {
			return new Response(JSON.stringify({ error: 'orderEmail is required' }), {
				status: 400,
				headers: buildCorsHeaders()
			});
		}
		if (contentType.includes('multipart/form-data') && !fileBuffer) {
			return new Response(JSON.stringify({ error: 'file is required' }), {
				status: 400,
				headers: buildCorsHeaders()
			});
		}

		const stripQuotes = (s?: string) => (s ? s.trim().replace(/^['"`](.*)['"`]$/, '$1') : '');
		const isValidEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
		const isValidSender = (s: string) =>
			isValidEmail(s) || /<[^<>@\s]+@[^<>@\s]+\.[^<>@\s]+>/.test(s);
		const fromAddress = stripQuotes(RESEND_FROM || '');
		if (!isValidSender(fromAddress)) {
			return new Response(JSON.stringify({ error: 'Invalid RESEND_FROM format' }), {
				status: 500,
				headers: buildCorsHeaders()
			});
		}
		const subject = `Order ${orderNumber} upload from customer`;
		const safeEmailRaw = stripQuotes(orderEmail || '');
		const safeEmail = isValidEmail(safeEmailRaw) ? safeEmailRaw : undefined;
		const imageHtml = uploadImage
			? `<div style="margin-top:16px;padding:12px;border:1px solid #e5e7eb;border-radius:8px;background:#fafafa">
  <div style="font-weight:600;margin-bottom:8px">Uploaded Image</div>
  <img src="${uploadImage}" alt="Uploaded image" style="max-width:100%;height:auto;border-radius:6px;border:1px solid #e5e7eb"/>
</div>`
			: '';
		const year = new Date().getFullYear();
		const html = `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f6f7f9">
    <div style="max-width:640px;margin:0 auto;padding:24px">
      <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden">
        <div style="padding:20px 24px;border-bottom:1px solid #e5e7eb;background:#0f172a;color:#ffffff">
          <div style="font-size:18px;font-weight:700;letter-spacing:0.4px">Coco Original</div>
          <div style="font-size:12px;opacity:0.85">Payment Slip Upload</div>
        </div>
        <div style="padding:20px 24px;color:#0f172a">
          <div style="display:flex;gap:24px;flex-wrap:wrap">
            <div style="flex:1;min-width:240px">
              <div style="font-size:12px;color:#6b7280">Order Number</div>
              <div style="font-size:16px;font-weight:600">${orderNumber}</div>
            </div>
            <div style="flex:1;min-width:240px">
              <div style="font-size:12px;color:#6b7280">Customer Email</div>
              <div style="font-size:16px;font-weight:600">${safeEmail}</div>
            </div>
          </div>
          ${imageHtml}
        </div>
        <div style="padding:16px 24px;border-top:1px solid #e5e7eb;background:#f9fafb;color:#6b7280;text-align:center;font-size:12px">
          Copyright © ${year} Coco Original. All rights reserved.
        </div>
      </div>
    </div>
  </body>
</html>`;

		const payload: CreateEmailOptions = {
			from: fromAddress,
			to: SHOP_OWNER_EMAIL,
			subject,
			...(safeEmail ? { replyTo: safeEmail } : {}),
			html,
			...(fileBuffer
				? {
						attachments: [
							{
								filename: fileName || 'attachment',
								content: fileBuffer
							}
						]
					}
				: {})
		};

		const { data, error } = await resend.emails.send(payload);
		if (error) {
			return new Response(JSON.stringify({ error }), {
				status: 500,
				headers: buildCorsHeaders()
			});
		}
		return new Response(JSON.stringify({ data }), {
			headers: buildCorsHeaders()
		});
	} catch (err) {
		return new Response(JSON.stringify({ error: 'Internal server error' }), {
			status: 500,
			headers: buildCorsHeaders()
		});
	}
};
