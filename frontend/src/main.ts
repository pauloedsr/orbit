import { bootstrapApplication } from '@angular/platform-browser';
import { provideMarkdown } from 'ngx-markdown';
import { AppComponent } from './app/app.component';

bootstrapApplication(AppComponent, {
  providers: [provideMarkdown()],
}).catch(err => console.error(err));
