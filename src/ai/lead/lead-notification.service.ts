import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

/**
 * Notifies the store about new leads. MVP channel: email via SMTP.
 * Without SMTP config the lead is only logged (it is still persisted in DB).
 */
@Injectable()
export class LeadNotificationService {
  private readonly logger = new Logger(LeadNotificationService.name);
  private transporter: nodemailer.Transporter | null = null;

  constructor() {
    if (process.env.SMTP_HOST) {
      this.transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587', 10),
        secure: process.env.SMTP_PORT === '465',
        auth: process.env.SMTP_USER
          ? {
              user: process.env.SMTP_USER,
              pass: process.env.SMTP_PASS,
            }
          : undefined,
      });
      this.logger.log('SMTP transport initialized for lead notifications');
    }
  }

  /**
   * Returns true when the store was actively notified.
   */
  async notifyNewLead(leadId: string, summary: string): Promise<boolean> {
    const to = process.env.STORE_NOTIFY_EMAIL;

    if (!this.transporter || !to) {
      this.logger.log(
        `Lead ${leadId} created (no SMTP/email configured, notification skipped)`,
      );
      return false;
    }

    await this.transporter.sendMail({
      from: process.env.SMTP_USER || 'noreply@carinsight.com.br',
      to,
      subject: `Novo lead do chat - ${leadId.substring(0, 8)}`,
      text: summary,
    });

    this.logger.log(`Lead ${leadId} notified to ${to}`);
    return true;
  }
}
